<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ShopPurchase extends Model
{
    protected $fillable = [
        'user_id',
        'item_key',
        'item_type',
        'quantity',
        'unit_price_ez_coins',
        'total_price_ez_coins',
        'payload',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'unit_price_ez_coins' => 'integer',
        'total_price_ez_coins' => 'integer',
        'payload' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
