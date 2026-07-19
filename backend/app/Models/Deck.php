<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Deck extends Model
{
    protected $fillable = [
        'user_id', 'hero_id', 'slot_number', 'name', 'description', 'is_preset', 'cover_image',
    ];

    protected $casts = [
        'is_preset' => 'boolean',
        'slot_number' => 'integer',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function hero()
    {
        return $this->belongsTo(Hero::class);
    }

    public function cards()
    {
        return $this->belongsToMany(Card::class, 'deck_cards')->withPivot('quantity');
    }

    public function deckCards()
    {
        return $this->hasMany(DeckCard::class);
    }

    public function playerDeckCards()
    {
        return $this->hasMany(PlayerDeckCard::class);
    }
}
