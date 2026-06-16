<?php

namespace App\Http\Controllers;

use App\Models\Deck;
use App\Models\PlayerCard;
use App\Models\PlayerDeckCard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class StarterDeckController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => collect(config('starter_decks'))
                ->map(fn (array $deck, string $key): array => [
                    'key' => $key,
                    'name' => $deck['name'],
                    'element' => $deck['element'],
                    'description' => $deck['description'],
                    'npc_image' => $deck['npc_image'],
                    'cover' => $deck['cover'] ?? null,
                    'card_count' => collect($deck['cards'])->sum('qty'),
                ])
                ->values(),
        ]);
    }

    public function choose(Request $request): JsonResponse
    {
        $starterKeys = array_keys(config('starter_decks'));
        $data = $request->validate([
            'starter_key' => ['required', 'string', Rule::in($starterKeys)],
        ]);

        $user = $request->user();
        if ($user->starter_deck_chosen_at) {
            return response()->json([
                'message' => 'Você já escolheu seu baralho inicial.',
            ], 422);
        }

        $starter = config('starter_decks')[$data['starter_key']];

        $result = DB::transaction(function () use ($user, $starter, $data): array {
            $deck = Deck::create([
                'user_id' => $user->id,
                'name' => $starter['name'],
                'description' => 'Baralho inicial escolhido no tutorial.',
                'is_preset' => false,
                'cover_image' => isset($starter['cover']['id'])
                    ? sprintf('%02d.png', (int) $starter['cover']['id'])
                    : null,
            ]);

            foreach ($starter['cards'] as $entry) {
                $playerCard = PlayerCard::firstOrNew([
                    'user_id' => $user->id,
                    'card_uid' => $entry['uid'],
                ]);
                $playerCard->fill([
                    'card_type' => $entry['type'],
                    'source_id' => $entry['id'],
                    'quantity' => ((int) $playerCard->quantity) + ((int) $entry['qty']),
                ])->save();

                PlayerDeckCard::create([
                    'deck_id' => $deck->id,
                    'card_uid' => $entry['uid'],
                    'card_type' => $entry['type'],
                    'source_id' => $entry['id'],
                    'quantity' => $entry['qty'],
                ]);
            }

            $user->forceFill([
                'starter_deck_key' => $data['starter_key'],
                'starter_deck_chosen_at' => now(),
                'crystals' => ((int) $user->crystals) + 50,
            ])->save();

            return [
                'user' => $user->fresh(),
                'deck' => $deck->load('playerDeckCards'),
            ];
        });

        return response()->json([
            'message' => 'Baralho inicial resgatado. Você recebeu 50 cristais.',
            'user' => $result['user'],
            'deck' => $result['deck'],
        ]);
    }
}
