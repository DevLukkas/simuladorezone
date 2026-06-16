<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SharedDeckBuild extends Model
{
    protected $fillable = [
        'user_id',
        'deck_id',
        'name',
        'cover_image',
        'decklist',
        'downloads',
        'votes_count',
        'votes_sum',
        'is_public',
    ];

    protected $casts = [
        'decklist' => 'array',
        'downloads' => 'integer',
        'votes_count' => 'integer',
        'votes_sum' => 'integer',
        'is_public' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function deck()
    {
        return $this->belongsTo(Deck::class);
    }
}
