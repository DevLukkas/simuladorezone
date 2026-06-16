<?php

use Illuminate\Support\Facades\Broadcast;
use App\Models\Room;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

Broadcast::channel('game.{roomId}', function ($user, int $roomId) {
    return Room::query()
        ->where('id', $roomId)
        ->where(function ($query) use ($user): void {
            $query->where('host_user_id', $user->id)
                ->orWhere('guest_user_id', $user->id);
        })
        ->exists();
});
