<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LabRarityRate extends Model
{
    protected $fillable = ['rarity', 'duration_minutes', 'chance_percent'];

    protected $casts = [
        'duration_minutes' => 'integer',
        'chance_percent' => 'float',
    ];
}
