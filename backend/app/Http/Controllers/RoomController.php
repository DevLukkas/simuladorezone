<?php

namespace App\Http\Controllers;

use App\Events\RoomCreated;
use App\Events\RoomUpdated;
use App\Models\Deck;
use App\Models\Room;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class RoomController extends Controller
{
    public function index(): JsonResponse
    {
        $this->expireStaleRooms();

        $rooms = Room::query()
            ->with(['host:id,name', 'guest:id,name'])
            ->whereIn('status', ['waiting', 'starting', 'in_progress'])
            ->latest()
            ->limit(30)
            ->get();

        return response()->json(['data' => $rooms]);
    }

    public function show(Room $room): JsonResponse
    {
        return response()->json([
            'data' => $room->load(['host:id,name', 'guest:id,name', 'hostDeck:id,name', 'guestDeck:id,name']),
        ]);
    }

    public function byCode(string $code): JsonResponse
    {
        $room = Room::query()
            ->with(['host:id,name', 'guest:id,name', 'hostDeck:id,name', 'guestDeck:id,name'])
            ->where('room_code', strtoupper($code))
            ->firstOrFail();

        return response()->json(['data' => $room]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'deck_id' => ['nullable', 'integer', 'exists:decks,id'],
            'mode' => ['nullable', 'string', 'in:pvp,solo'],
            'room_code' => ['nullable', 'string', 'max:8', 'unique:rooms,room_code'],
        ]);

        $deckId = $this->authorizedDeckId($request, $data['deck_id'] ?? null);
        $roomCode = isset($data['room_code'])
            ? strtoupper($data['room_code'])
            : Room::generateCode();

        $room = Room::create([
            'room_code' => $roomCode,
            'host_user_id' => $request->user()->id,
            'host_deck_id' => $deckId,
            'status' => 'waiting',
            'game_state' => [
                'mode' => $data['mode'] ?? 'pvp',
                'turn_number' => 1,
                'phase' => 'setup',
                'host_ready' => false,
                'guest_ready' => false,
            ],
        ]);

        $room->load(['host:id,name', 'guest:id,name']);
        $this->broadcastSafely(static fn () => RoomCreated::dispatch($room));

        return response()->json(['data' => $room], 201);
    }

    public function join(Request $request): JsonResponse
    {
        $data = $request->validate([
            'room_code' => ['required', 'string'],
            'deck_id' => ['nullable', 'integer', 'exists:decks,id'],
        ]);

        $room = Room::query()
            ->where('room_code', strtoupper($data['room_code']))
            ->firstOrFail();

        if ($room->host_user_id === $request->user()->id) {
            return response()->json(['message' => 'Você já é o host desta sala.'], 422);
        }

        if ($room->guest_user_id && $room->guest_user_id !== $request->user()->id) {
            return response()->json(['message' => 'Sala já possui oponente.'], 422);
        }

        if (!in_array($room->status, ['waiting', 'starting'], true)) {
            return response()->json(['message' => 'Sala não está disponível.'], 422);
        }

        $room->forceFill([
            'guest_user_id' => $request->user()->id,
            'guest_deck_id' => $this->authorizedDeckId($request, $data['deck_id'] ?? null),
            'status' => 'starting',
            'game_state' => array_merge($room->game_state ?? [], [
                'phase' => 'setup',
                'guest_ready' => false,
            ]),
        ])->save();

        $room->load(['host:id,name', 'guest:id,name']);
        $this->broadcastSafely(static fn () => RoomUpdated::dispatch($room));

        return response()->json(['data' => $room]);
    }

    public function ready(Request $request, Room $room): JsonResponse
    {
        if (!$this->userBelongsToRoom($request->user()->id, $room)) {
            return response()->json(['message' => 'Você não pertence a esta sala.'], 403);
        }

        if ($room->status === 'finished') {
            return response()->json(['message' => 'Sala já finalizada.'], 422);
        }

        $state = $room->game_state ?? [];
        if ($room->host_user_id === $request->user()->id) {
            $state['host_ready'] = true;
        } else {
            $state['guest_ready'] = true;
        }

        $bothReady = $room->guest_user_id
            && ($state['host_ready'] ?? false)
            && ($state['guest_ready'] ?? false);

        $room->forceFill([
            'status' => $bothReady ? 'in_progress' : ($room->guest_user_id ? 'starting' : 'waiting'),
            'started_at' => $bothReady ? ($room->started_at ?? now()) : $room->started_at,
            'game_state' => array_merge($state, [
                'phase' => $bothReady ? 'main' : 'setup',
                'active_player_id' => $bothReady ? $room->host_user_id : ($state['active_player_id'] ?? null),
            ]),
        ])->save();

        $room->load(['host:id,name', 'guest:id,name']);
        $this->broadcastSafely(static fn () => RoomUpdated::dispatch($room));

        return response()->json(['data' => $room]);
    }

    public function start(Request $request, Room $room): JsonResponse
    {
        if ($room->host_user_id !== $request->user()->id) {
            return response()->json(['message' => 'Apenas o host pode iniciar a sala.'], 403);
        }

        if ($room->status === 'finished') {
            return response()->json(['message' => 'Sala já finalizada.'], 422);
        }

        $room->forceFill([
            'status' => 'in_progress',
            'started_at' => $room->started_at ?? now(),
            'game_state' => array_merge($room->game_state ?? [], [
                'phase' => 'main',
                'active_player_id' => $room->host_user_id,
            ]),
        ])->save();

        $room->load(['host:id,name', 'guest:id,name']);
        $this->broadcastSafely(static fn () => RoomUpdated::dispatch($room));

        return response()->json(['data' => $room]);
    }

    public function finish(Request $request, Room $room): JsonResponse
    {
        if (!$this->userBelongsToRoom($request->user()->id, $room)) {
            return response()->json(['message' => 'Você não pertence a esta sala.'], 403);
        }

        if ($room->status !== 'finished') {
            $room->forceFill([
                'status' => 'finished',
                'finished_at' => now(),
                'game_state' => array_merge($room->game_state ?? [], [
                    'phase' => 'finished',
                    'finished_by_user_id' => $request->user()->id,
                ]),
            ])->save();
        }

        $room->load(['host:id,name', 'guest:id,name']);
        $this->broadcastSafely(static fn () => RoomUpdated::dispatch($room));

        return response()->json(['data' => $room]);
    }

    public function destroy(Request $request, Room $room): JsonResponse
    {
        if ($room->host_user_id !== $request->user()->id) {
            return response()->json(['message' => 'Apenas o host pode cancelar a sala.'], 403);
        }

        if (!in_array($room->status, ['waiting', 'starting'], true)) {
            return response()->json(['message' => 'Sala já iniciada.'], 422);
        }

        $room->delete();
        $this->broadcastSafely(static fn () => RoomUpdated::dispatch($room));

        return response()->json(['data' => ['deleted' => true]]);
    }

    private function authorizedDeckId(Request $request, ?int $deckId): ?int
    {
        if (!$deckId) return null;

        $deck = Deck::query()
            ->where('id', $deckId)
            ->where(function ($query) use ($request): void {
                $query->where('user_id', $request->user()->id)
                    ->orWhere('is_preset', true);
            })
            ->first();

        abort_if(!$deck, 403, 'Deck indisponível para este jogador.');
        abort_if(
            DeckController::deckIsLockedFor($request->user(), $deck),
            423,
            'Este baralho está em um espaço VIP bloqueado. Reative VIP para usar.'
        );

        return $deck->id;
    }

    private function expireStaleRooms(): void
    {
        $now = now();

        Room::query()
            ->where('status', 'in_progress')
            ->where('updated_at', '<', $now->copy()->subHours(6))
            ->update([
                'status' => 'finished',
                'finished_at' => $now,
                'updated_at' => $now,
            ]);

        Room::query()
            ->whereIn('status', ['waiting', 'starting'])
            ->where('updated_at', '<', $now->copy()->subHours(2))
            ->update([
                'status' => 'finished',
                'finished_at' => $now,
                'updated_at' => $now,
            ]);
    }

    private function userBelongsToRoom(int $userId, Room $room): bool
    {
        return $room->host_user_id === $userId || $room->guest_user_id === $userId;
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
