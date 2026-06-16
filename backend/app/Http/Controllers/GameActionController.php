<?php

namespace App\Http\Controllers;

use App\Events\GameActionBroadcast;
use App\Models\GameAction;
use App\Models\Room;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class GameActionController extends Controller
{
    public function store(Request $request, Room $room): JsonResponse
    {
        if (!$this->userBelongsToRoom($request->user()->id, $room)) {
            return response()->json(['message' => 'Você não pertence a esta sala.'], 403);
        }

        if ($room->status === 'finished') {
            return response()->json(['message' => 'Partida já finalizada.'], 422);
        }

        $data = $request->validate([
            'action_type' => ['required', 'string', 'max:80'],
            'payload' => ['nullable', 'array'],
            'turn_number' => ['nullable', 'integer', 'min:1'],
        ]);

        $turnNumber = $data['turn_number']
            ?? (int) data_get($room->game_state, 'turn_number', 1);

        $action = GameAction::create([
            'room_id' => $room->id,
            'user_id' => $request->user()->id,
            'action_type' => $data['action_type'],
            'payload' => $data['payload'] ?? [],
            'turn_number' => $turnNumber,
        ]);

        $this->updateRoomStateFromAction($room, $action);
        $this->broadcastSafely(static fn () => GameActionBroadcast::dispatch($action));

        return response()->json(['data' => $action], 201);
    }

    private function userBelongsToRoom(int $userId, Room $room): bool
    {
        return $room->host_user_id === $userId || $room->guest_user_id === $userId;
    }

    private function updateRoomStateFromAction(Room $room, GameAction $action): void
    {
        $state = $room->game_state ?? [];
        $state['last_action_id'] = $action->id;
        $state['last_action_type'] = $action->action_type;

        if ($action->action_type === 'end_turn') {
            $state['turn_number'] = ((int) ($state['turn_number'] ?? 1)) + 1;
            $state['active_player_id'] = ($state['active_player_id'] ?? $room->host_user_id) === $room->host_user_id
                ? $room->guest_user_id
                : $room->host_user_id;
            $state['phase'] = 'main';
        }

        if ($action->action_type === 'phase_change') {
            $phase = $action->payload['phase'] ?? null;
            if (in_array($phase, ['main', 'battle'], true)) {
                $state['phase'] = $phase;
            }
        }

        $room->forceFill(['game_state' => $state])->save();
    }

    private function broadcastSafely(callable $broadcast): void
    {
        try {
            $broadcast();
        } catch (Throwable $error) {
            report($error);
        }
    }
}
