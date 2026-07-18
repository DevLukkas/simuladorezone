<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LabCraftRecipe extends Model
{
    protected $fillable = ['recipe_key', 'name', 'card_type', 'requires_element', 'essence_cost'];

    protected $casts = [
        'requires_element' => 'boolean',
        'essence_cost' => 'integer',
    ];
}
