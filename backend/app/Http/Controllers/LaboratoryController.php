<?php

namespace App\Http\Controllers;

use App\Models\LabCraftProject;
use App\Models\LabCraftRecipe;
use App\Models\LabRarityRate;
use App\Models\PlayerCard;
use App\Models\User;
use App\Models\UserInventoryItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class LaboratoryController extends Controller
{
    public function status(Request $request): JsonResponse
    {
        $user = $request->user()->fresh();

        return response()->json([
            'user' => $user,
            'essences' => (int) $user->card_essences,
            'recipes' => LabCraftRecipe::query()->orderBy('id')->get(),
            'rates' => LabRarityRate::query()->orderBy('duration_minutes')->get(),
            'projects' => $this->projectsFor($user),
            'dissolvable_cards' => $this->dissolvableCardsFor($user),
            'accelerators' => $this->acceleratorsFor($user),
            'boosters' => $this->boosters(),
        ]);
    }

    public function dissolve(Request $request): JsonResponse
    {
        $data = $request->validate([
            'card_uid' => ['required', 'string'],
            'quantity' => ['sometimes', 'integer', 'min:1', 'max:99'],
        ]);

        $quantity = (int) ($data['quantity'] ?? 1);

        $result = DB::transaction(function () use ($request, $data, $quantity): array {
            $user = User::query()->whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            $playerCard = PlayerCard::query()
                ->where('user_id', $user->id)
                ->where('card_uid', $data['card_uid'])
                ->lockForUpdate()
                ->first();

            if (!$playerCard || (int) $playerCard->quantity <= 3) {
                return ['error' => 'Voce precisa ter mais de 3 copias para dissolver esta carta.'];
            }

            $maxDissolve = ((int) $playerCard->quantity) - 3;
            if ($quantity > $maxDissolve) {
                return ['error' => 'Quantidade acima do excedente disponivel.'];
            }

            $catalogCard = $this->cardByUid($playerCard->card_uid);
            if (!$catalogCard) {
                return ['error' => 'Carta nao encontrada no catalogo do laboratorio.'];
            }

            $gain = ((int) config('card_catalog.essence_by_rarity.'.$catalogCard['rarity'], 0)) * $quantity;
            $playerCard->decrement('quantity', $quantity);
            $user->increment('card_essences', $gain);

            return ['user' => $user->fresh(), 'essence_gained' => $gain];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'message' => 'Carta dissolvida.',
            'essence_gained' => $result['essence_gained'],
            'user' => $result['user'],
            'dissolvable_cards' => $this->dissolvableCardsFor($result['user']),
        ]);
    }

    public function craft(Request $request): JsonResponse
    {
        $data = $request->validate([
            'recipe_key' => ['required', 'string', 'exists:lab_craft_recipes,recipe_key'],
            'element' => ['nullable', 'string', Rule::in(['agua', 'terra', 'fogo', 'vento', 'vazio', 'cosmico', 'neutro'])],
        ]);

        $result = DB::transaction(function () use ($request, $data): array {
            $user = User::query()->whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            $recipe = LabCraftRecipe::query()->where('recipe_key', $data['recipe_key'])->firstOrFail();

            if ($recipe->requires_element && empty($data['element'])) {
                return ['error' => 'Escolha um elemento para esta receita.'];
            }

            if ((int) $user->card_essences < (int) $recipe->essence_cost) {
                return ['error' => 'Essencias insuficientes.'];
            }

            if ($this->projectsFor($user)->where('status', 'crafting')->count() >= 1) {
                return ['error' => 'Voce ja possui uma carta em criacao.'];
            }

            $rarity = $this->rollRarity();
            $rate = LabRarityRate::query()->where('rarity', $rarity)->firstOrFail();
            $resultCard = $this->randomCardFor($recipe, $data['element'] ?? null, $rarity);
            if (!$resultCard) {
                return ['error' => 'Ainda nao existem cartas para esta combinacao.'];
            }

            $user->decrement('card_essences', (int) $recipe->essence_cost);
            $project = LabCraftProject::create([
                'user_id' => $user->id,
                'lab_craft_recipe_id' => $recipe->id,
                'status' => 'crafting',
                'selected_element' => $data['element'] ?? null,
                'result_rarity' => $rarity,
                'result_card_uid' => $resultCard['uid'],
                'started_at' => now(),
                'completes_at' => now()->addMinutes((int) $rate->duration_minutes),
                'payload' => ['card' => $resultCard],
            ]);

            return ['user' => $user->fresh(), 'project' => $project->load('recipe')];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'message' => 'Criacao iniciada.',
            'user' => $result['user'],
            'project' => $result['project'],
            'projects' => $this->projectsFor($result['user']),
        ], 201);
    }

    public function accelerate(Request $request, LabCraftProject $project): JsonResponse
    {
        $data = $request->validate([
            'item_key' => ['required', 'string', Rule::in(['dust_1h', 'dust_3h', 'dust_10h'])],
        ]);

        if ((int) $project->user_id !== (int) $request->user()->id || $project->status !== 'crafting') {
            return response()->json(['message' => 'Projeto indisponivel.'], 422);
        }

        $result = DB::transaction(function () use ($request, $project, $data): array {
            $item = UserInventoryItem::query()
                ->where('user_id', $request->user()->id)
                ->where('item_key', $data['item_key'])
                ->where('quantity', '>', 0)
                ->lockForUpdate()
                ->first();

            if (!$item) {
                return ['error' => 'Voce nao possui este po acelerador.'];
            }

            $minutes = (int) ($item->payload['minutes'] ?? 0);
            $project = LabCraftProject::query()->whereKey($project->id)->lockForUpdate()->firstOrFail();
            $project->forceFill([
                'completes_at' => $project->completes_at->copy()->subMinutes($minutes)->max(now()),
            ])->save();
            $item->decrement('quantity');

            return ['project' => $project->fresh()->load('recipe')];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'message' => 'Po acelerador usado.',
            'project' => $result['project'],
            'projects' => $this->projectsFor($request->user()),
            'accelerators' => $this->acceleratorsFor($request->user()),
        ]);
    }

    public function claim(Request $request, LabCraftProject $project): JsonResponse
    {
        if ((int) $project->user_id !== (int) $request->user()->id || $project->status !== 'crafting') {
            return response()->json(['message' => 'Projeto indisponivel.'], 422);
        }

        if ($project->completes_at->isFuture()) {
            return response()->json(['message' => 'A carta ainda esta em criacao.'], 422);
        }

        $result = DB::transaction(function () use ($request, $project): array {
            $project = LabCraftProject::query()->whereKey($project->id)->lockForUpdate()->firstOrFail();
            if ($project->status !== 'crafting') {
                return ['error' => 'Projeto ja resgatado.'];
            }

            $card = $this->cardByUid($project->result_card_uid);
            $playerCard = PlayerCard::firstOrNew([
                'user_id' => $request->user()->id,
                'card_uid' => $project->result_card_uid,
            ]);
            $playerCard->fill([
                'nome_card' => $card['name'],
                'card_type' => $card['type'],
                'source_id' => $card['id'],
                'quantity' => ((int) $playerCard->quantity) + 1,
            ])->save();

            $project->forceFill(['status' => 'claimed', 'claimed_at' => now()])->save();

            return ['card' => $card, 'project' => $project->fresh()->load('recipe')];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'message' => 'Carta criada.',
            'card' => $result['card'],
            'project' => $result['project'],
            'projects' => $this->projectsFor($request->user()),
        ]);
    }

    public function buyBooster(Request $request): JsonResponse
    {
        $editionKeys = collect($this->boosters())->pluck('key')->all();
        $data = $request->validate([
            'edition_key' => ['required', 'string', Rule::in($editionKeys)],
        ]);

        $booster = collect($this->boosters())->firstWhere('key', $data['edition_key']);
        if (!$booster['available']) {
            return response()->json(['message' => 'Booster em breve.'], 422);
        }

        $result = DB::transaction(function () use ($request, $booster): array {
            $user = User::query()->whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            if ((int) $user->crystals < (int) $booster['price_crystals']) {
                return ['error' => 'Cristais insuficientes.'];
            }

            $cards = collect(range(1, 5))->map(fn () => $this->randomBoosterCard($booster['name']))->filter()->values();
            if ($cards->count() < 5) {
                return ['error' => 'Nao ha cartas suficientes para este booster.'];
            }

            $user->decrement('crystals', (int) $booster['price_crystals']);
            foreach ($cards as $card) {
                $playerCard = PlayerCard::firstOrNew([
                    'user_id' => $user->id,
                    'card_uid' => $card['uid'],
                ]);
                $playerCard->fill([
                    'nome_card' => $card['name'],
                    'card_type' => $card['type'],
                    'source_id' => $card['id'],
                    'quantity' => ((int) $playerCard->quantity) + 1,
                ])->save();
            }

            return ['user' => $user->fresh(), 'cards' => $cards->all()];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'message' => 'Booster comprado.',
            'user' => $result['user'],
            'cards' => $result['cards'],
        ], 201);
    }

    private function projectsFor(User $user): Collection
    {
        return LabCraftProject::query()
            ->with('recipe')
            ->where('user_id', $user->id)
            ->latest()
            ->limit(8)
            ->get();
    }

    private function dissolvableCardsFor(User $user): Collection
    {
        return $user->playerCards()
            ->where('quantity', '>', 3)
            ->get()
            ->map(function (PlayerCard $playerCard): ?array {
                $card = $this->cardByUid($playerCard->card_uid);
                if (!$card) return null;
                return [
                    ...$card,
                    'quantity' => $playerCard->quantity,
                    'dissolvable' => max(0, ((int) $playerCard->quantity) - 3),
                    'essence_value' => config('card_catalog.essence_by_rarity.'.$card['rarity'], 0),
                ];
            })
            ->filter()
            ->values();
    }

    private function acceleratorsFor(User $user): Collection
    {
        return $user->inventoryItems()
            ->where('item_type', 'accelerator_dust')
            ->where('quantity', '>', 0)
            ->orderBy('item_key')
            ->get();
    }

    private function cardByUid(?string $uid): ?array
    {
        $card = config('card_catalog.cards.'.$uid);
        return $card ? ['uid' => $uid, ...$card] : null;
    }

    private function rollRarity(): string
    {
        $rates = LabRarityRate::query()->get();
        $roll = mt_rand(1, 10000) / 100;
        $cursor = 0.0;
        foreach ($rates as $rate) {
            $cursor += (float) $rate->chance_percent;
            if ($roll <= $cursor) return $rate->rarity;
        }
        return 'comum';
    }

    private function randomCardFor(LabCraftRecipe $recipe, ?string $element, string $rarity): ?array
    {
        $cards = collect(config('card_catalog.cards'))
            ->map(fn (array $card, string $uid): array => ['uid' => $uid, ...$card])
            ->where('type', $recipe->card_type)
            ->where('rarity', $rarity);

        if ($recipe->requires_element) {
            $cards = $cards->where('element', $element);
        }

        if ($cards->isEmpty() && $rarity === 'lendaria') {
            return $this->randomCardFor($recipe, $element, 'rara');
        }
        if ($cards->isEmpty() && $rarity === 'rara') {
            return $this->randomCardFor($recipe, $element, 'comum');
        }

        return $cards->values()->random();
    }

    private function randomBoosterCard(string $edition): ?array
    {
        $rarity = $this->rollRarity();
        $cards = collect(config('card_catalog.cards'))
            ->map(fn (array $card, string $uid): array => ['uid' => $uid, ...$card])
            ->where('edition', $edition)
            ->where('rarity', $rarity);

        if ($cards->isEmpty() && $rarity !== 'comum') {
            $cards = collect(config('card_catalog.cards'))
                ->map(fn (array $card, string $uid): array => ['uid' => $uid, ...$card])
                ->where('edition', $edition)
                ->where('rarity', 'comum');
        }

        return $cards->isEmpty() ? null : $cards->values()->random();
    }

    private function boosters(): array
    {
        return config('card_catalog.booster_editions');
    }
}
