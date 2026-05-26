<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Card extends Model
{
    protected $fillable = [
        'name', 'card_type', 'mana_cost', 'attack', 'defense',
        'description', 'image_path', 'rarity', 'effects',
    ];

    protected $casts = [
        'effects' => 'array',
        'mana_cost' => 'integer',
        'attack' => 'integer',
        'defense' => 'integer',
    ];

    public function decks()
    {
        return $this->belongsToMany(Deck::class, 'deck_cards')->withPivot('quantity');
    }
}
