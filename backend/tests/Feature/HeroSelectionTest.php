<?php

namespace Tests\Feature;

use App\Models\Deck;
use App\Models\Hero;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HeroSelectionTest extends TestCase
{
    use RefreshDatabase;

    public function test_player_can_list_the_five_initial_heroes(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/heroes');

        $response
            ->assertOk()
            ->assertJsonCount(5, 'data')
            ->assertJsonPath('data.0.key', 'tennor')
            ->assertJsonPath('data.3.key', 'badur');
    }

    public function test_player_can_choose_one_initial_hero_for_their_first_deck(): void
    {
        $user = User::factory()->create([
            'starter_deck_chosen_at' => now(),
        ]);
        $deck = Deck::create([
            'user_id' => $user->id,
            'slot_number' => 1,
            'name' => 'Baralho inicial',
        ]);

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/heroes/choose-initial', ['hero_key' => 'badur']);

        $hero = Hero::where('key', 'badur')->firstOrFail();
        $response
            ->assertOk()
            ->assertJsonPath('hero.key', 'badur')
            ->assertJsonPath('deck.id', $deck->id)
            ->assertJsonPath('user.hero_id', $hero->id);

        $this->assertSame($hero->id, $user->fresh()->hero_id);
        $this->assertNotNull($user->fresh()->initial_hero_chosen_at);
        $this->assertSame($hero->id, $deck->fresh()->hero_id);
        $this->assertDatabaseHas('user_heroes', [
            'user_id' => $user->id,
            'hero_id' => $hero->id,
        ]);
    }

    public function test_player_cannot_choose_a_second_initial_hero(): void
    {
        $user = User::factory()->create([
            'starter_deck_chosen_at' => now(),
            'initial_hero_chosen_at' => now(),
        ]);

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/heroes/choose-initial', ['hero_key' => 'tennor']);

        $response->assertUnprocessable();
    }

    public function test_deck_cannot_be_saved_without_a_hero(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/decks', [
            'name' => 'Sem lider',
            'cards' => [
                ['uid' => 'criatura:1', 'type' => 'criatura', 'id' => 1, 'qty' => 1],
            ],
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonValidationErrors('hero_id');
    }
}
