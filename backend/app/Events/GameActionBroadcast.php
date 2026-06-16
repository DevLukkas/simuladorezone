<?php

namespace App\Events;

use App\Models\GameAction;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class GameActionBroadcast implements ShouldBroadcastNow
{
    use Dispatchable, SerializesModels;

    public function __construct(public GameAction $action)
    {
    }

    public function broadcastOn(): Channel
    {
        return new Channel('game.'.$this->action->room_id);
    }

    public function broadcastWith(): array
    {
        return [
            'id' => $this->action->id,
            'room_id' => $this->action->room_id,
            'user_id' => $this->action->user_id,
            'action_type' => $this->action->action_type,
            'payload' => $this->action->payload,
            'turn_number' => $this->action->turn_number,
            'created_at' => $this->action->created_at?->toISOString(),
        ];
    }
}
