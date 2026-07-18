<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserInventoryItem extends Model
{
    protected $fillable = [
        'user_id',
        'item_key',
        'item_type',
        'quantity',
        'payload',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'payload' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
