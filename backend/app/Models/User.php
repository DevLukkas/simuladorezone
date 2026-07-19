<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable([
    'name',
    'email',
    'password',
    'starter_deck_key',
    'starter_deck_chosen_at',
    'hero_id',
    'initial_hero_chosen_at',
    'crystals',
    'ez_coins',
    'card_essences',
    'avatar_card_id',
    'avatar_url',
    'level',
    'ranking_points',
    'ranking_position',
    'wins',
    'losses',
    'gifts_sent',
    'membro_vip',
])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'starter_deck_chosen_at' => 'datetime',
            'initial_hero_chosen_at' => 'datetime',
            'crystals' => 'integer',
            'ez_coins' => 'integer',
            'card_essences' => 'integer',
            'avatar_card_id' => 'integer',
            'level' => 'integer',
            'ranking_points' => 'integer',
            'ranking_position' => 'integer',
            'wins' => 'integer',
            'losses' => 'integer',
            'gifts_sent' => 'integer',
            'membro_vip' => 'boolean',
        ];
    }

    public function playerCards()
    {
        return $this->hasMany(PlayerCard::class);
    }

    public function decks()
    {
        return $this->hasMany(Deck::class);
    }

    public function initialHero()
    {
        return $this->belongsTo(Hero::class, 'hero_id');
    }

    public function heroes()
    {
        return $this->belongsToMany(Hero::class, 'user_heroes')->withPivot('unlocked_at')->withTimestamps();
    }

    public function friendships()
    {
        return $this->hasMany(Friendship::class);
    }

    public function inventoryItems()
    {
        return $this->hasMany(UserInventoryItem::class);
    }

    public function shopPurchases()
    {
        return $this->hasMany(ShopPurchase::class);
    }

    public function labCraftProjects()
    {
        return $this->hasMany(LabCraftProject::class);
    }

    public function sharedDeckBuilds()
    {
        return $this->hasMany(SharedDeckBuild::class);
    }
}
