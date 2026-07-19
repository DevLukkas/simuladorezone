<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Hero extends Model
{
    protected $fillable = [
        'key', 'name', 'race', 'element', 'effect_name', 'effect_description', 'story', 'avatar_path', 'display_order',
    ];

    protected $casts = [
        'display_order' => 'integer',
    ];

    public function users()
    {
        return $this->belongsToMany(User::class, 'user_heroes')->withPivot('unlocked_at')->withTimestamps();
    }

    public function decks()
    {
        return $this->hasMany(Deck::class);
    }
}
