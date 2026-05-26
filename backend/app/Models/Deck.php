<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Deck extends Model
{
    protected $fillable = [
        'user_id', 'name', 'description', 'is_preset', 'cover_image',
    ];

    protected $casts = [
        'is_preset' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function cards()
    {
        return $this->belongsToMany(Card::class, 'deck_cards')->withPivot('quantity');
    }

    public function deckCards()
    {
        return $this->hasMany(DeckCard::class);
    }
}
