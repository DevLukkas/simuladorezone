<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlayerCard extends Model
{
    protected $fillable = [
        'user_id',
        'card_uid',
        'card_type',
        'source_id',
        'quantity',
    ];

    protected $casts = [
        'source_id' => 'integer',
        'quantity' => 'integer',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
