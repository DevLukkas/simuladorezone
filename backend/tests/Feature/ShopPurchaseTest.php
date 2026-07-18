<?php

namespace Tests\Feature;

use App\Models\ShopPurchase;
use App\Models\User;
use App\Models\UserInventoryItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShopPurchaseTest extends TestCase
{
    use RefreshDatabase;

    public function test_player_can_buy_shop_item_with_ez_coins(): void
    {
        $user = User::factory()->create(['ez_coins' => 150]);

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/shop/purchase', ['item_key' => 'dust_1h']);

        $response
            ->assertCreated()
            ->assertJsonPath('user.ez_coins', 100)
            ->assertJsonPath('item.item_key', 'dust_1h')
            ->assertJsonPath('item.quantity', 1);

        $this->assertDatabaseHas(UserInventoryItem::class, [
            'user_id' => $user->id,
            'item_key' => 'dust_1h',
            'quantity' => 1,
        ]);
        $this->assertDatabaseHas(ShopPurchase::class, [
            'user_id' => $user->id,
            'item_key' => 'dust_1h',
            'total_price_ez_coins' => 50,
        ]);
    }

    public function test_player_cannot_buy_without_enough_ez_coins(): void
    {
        $user = User::factory()->create(['ez_coins' => 40]);

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/shop/purchase', ['item_key' => 'dust_1h']);

        $response
            ->assertUnprocessable()
            ->assertJsonPath('message', 'EZ-Coins insuficientes.');

        $this->assertSame(40, $user->fresh()->ez_coins);
        $this->assertDatabaseMissing(UserInventoryItem::class, [
            'user_id' => $user->id,
            'item_key' => 'dust_1h',
        ]);
    }
}
