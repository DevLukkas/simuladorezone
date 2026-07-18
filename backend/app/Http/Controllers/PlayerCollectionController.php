<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlayerCollectionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $cards = $request->user()
            ->playerCards()
            ->where('quantity', '>', 0)
            ->orderBy('card_type')
            ->orderBy('source_id')
            ->get()
            ->map(fn ($card): array => [
                'uid' => $card->card_uid,
                'name' => $card->nome_card,
                'type' => $card->card_type,
                'id' => $card->source_id,
                'quantity' => $card->quantity,
            ])
            ->values();

        return response()->json([
            'data' => $cards,
        ]);
    }
}
