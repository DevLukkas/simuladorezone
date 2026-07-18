<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LabCraftProject extends Model
{
    protected $fillable = [
        'user_id',
        'lab_craft_recipe_id',
        'status',
        'selected_element',
        'result_rarity',
        'result_card_uid',
        'started_at',
        'completes_at',
        'claimed_at',
        'payload',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'completes_at' => 'datetime',
        'claimed_at' => 'datetime',
        'payload' => 'array',
    ];

    public function recipe()
    {
        return $this->belongsTo(LabCraftRecipe::class, 'lab_craft_recipe_id');
    }
}
