<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlayerDeckCard extends Model
{
    protected $fillable = [
        'deck_id',
        'card_uid',
        'card_type',
        'source_id',
        'quantity',
    ];

    protected $casts = [
        'source_id' => 'integer',
        'quantity' => 'integer',
    ];

    public function deck()
    {
        return $this->belongsTo(Deck::class);
    }
}
