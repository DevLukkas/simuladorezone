<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Room extends Model
{
    protected $fillable = [
        'room_code', 'host_user_id', 'guest_user_id',
        'host_deck_id', 'guest_deck_id', 'status', 'game_state',
        'started_at', 'finished_at',
    ];

    protected $casts = [
        'game_state' => 'array',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    public function host()
    {
        return $this->belongsTo(User::class, 'host_user_id');
    }

    public function guest()
    {
        return $this->belongsTo(User::class, 'guest_user_id');
    }

    public function hostDeck()
    {
        return $this->belongsTo(Deck::class, 'host_deck_id');
    }

    public function guestDeck()
    {
        return $this->belongsTo(Deck::class, 'guest_deck_id');
    }

    public function actions()
    {
        return $this->hasMany(GameAction::class);
    }

    public static function generateCode(): string
    {
        do {
            $code = 'EZ-' . strtoupper(substr(str_shuffle('ABCDEFGHJKLMNPQRSTUVWXYZ23456789'), 0, 4));
        } while (self::where('room_code', $code)->exists());

        return $code;
    }
}
