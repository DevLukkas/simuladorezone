<?php

namespace App\Events;

use App\Models\Room;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class RoomUpdated implements ShouldBroadcastNow
{
    use Dispatchable, SerializesModels;

    public function __construct(public Room $room)
    {
        $this->room->loadMissing(['host', 'guest']);
    }

    public function broadcastOn(): Channel
    {
        return new Channel('rooms');
    }

    public function broadcastWith(): array
    {
        return [
            'room' => $this->room->toArray(),
        ];
    }
}
