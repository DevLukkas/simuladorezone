<?php

namespace App\Http\Controllers;

use App\Models\ShopPurchase;
use App\Models\User;
use App\Models\UserInventoryItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ShopController extends Controller
{
    private const CATALOG = [
        'dust_1h' => [
            'title' => 'Po Acelerador',
            'item_type' => 'accelerator_dust',
            'price_ez_coins' => 50,
            'payload' => ['minutes' => 30, 'tier' => 'basic'],
        ],
        'dust_3h' => [
            'title' => 'Po Acelerador Roxo',
            'item_type' => 'accelerator_dust',
            'price_ez_coins' => 100,
            'payload' => ['minutes' => 60, 'tier' => 'purple'],
        ],
        'dust_10h' => [
            'title' => 'Po Acelerador Black',
            'item_type' => 'accelerator_dust',
            'price_ez_coins' => 200,
            'payload' => ['minutes' => 300, 'tier' => 'black'],
        ],
        'packs_1' => [
            'title' => '1 Pacote de Cartas',
            'item_type' => 'card_pack',
            'price_ez_coins' => 100,
            'payload' => ['packs' => 1, 'cards' => 5],
        ],
        'packs_3' => [
            'title' => '3 Pacotes de Cartas',
            'item_type' => 'card_pack',
            'price_ez_coins' => 250,
            'payload' => ['packs' => 3, 'cards' => 15],
        ],
        'packs_10' => [
            'title' => '10 Pacotes de Cartas',
            'item_type' => 'card_pack',
            'price_ez_coins' => 800,
            'payload' => ['packs' => 10, 'cards' => 50],
        ],
    ];

    public function inventory(Request $request): JsonResponse
    {
        return response()->json([
            'items' => $this->inventoryFor($request->user()),
            'user' => $request->user()->fresh(),
        ]);
    }

    public function purchase(Request $request): JsonResponse
    {
        $data = $request->validate([
            'item_key' => ['required', 'string', Rule::in(array_keys(self::CATALOG))],
        ]);

        $offer = self::CATALOG[$data['item_key']];

        $result = DB::transaction(function () use ($request, $data, $offer): array {
            $user = User::query()
                ->whereKey($request->user()->id)
                ->lockForUpdate()
                ->firstOrFail();

            $price = (int) $offer['price_ez_coins'];
            if ((int) $user->ez_coins < $price) {
                return ['error' => 'EZ-Coins insuficientes.'];
            }

            $user->forceFill([
                'ez_coins' => ((int) $user->ez_coins) - $price,
            ])->save();

            $item = UserInventoryItem::query()
                ->firstOrNew([
                    'user_id' => $user->id,
                    'item_key' => $data['item_key'],
                ]);

            $item->fill([
                'item_type' => $offer['item_type'],
                'quantity' => ((int) $item->quantity) + 1,
                'payload' => $offer['payload'],
            ])->save();

            $purchase = ShopPurchase::create([
                'user_id' => $user->id,
                'item_key' => $data['item_key'],
                'item_type' => $offer['item_type'],
                'quantity' => 1,
                'unit_price_ez_coins' => $price,
                'total_price_ez_coins' => $price,
                'payload' => $offer['payload'],
            ]);

            return [
                'item' => $item->fresh(),
                'purchase' => $purchase,
                'user' => $user->fresh(),
            ];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'message' => 'Compra registrada.',
            'item' => $result['item'],
            'purchase' => $result['purchase'],
            'items' => $this->inventoryFor($result['user']),
            'user' => $result['user'],
        ], 201);
    }

    private function inventoryFor(User $user)
    {
        return UserInventoryItem::query()
            ->where('user_id', $user->id)
            ->orderBy('item_type')
            ->orderBy('item_key')
            ->get();
    }
}
