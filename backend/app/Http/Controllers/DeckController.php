<?php

namespace App\Http\Controllers;

use App\Models\Deck;
use App\Models\PlayerDeckCard;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DeckController extends Controller
{
    private const FREE_DECK_LIMIT = 2;
    private const VIP_DECK_LIMIT = 8;
    private const MAX_CARDS = 40;
    private const MAX_COPIES = 3;

    public function index(Request $request): JsonResponse
    {
        $user = $request->user()->fresh();
        $allowedSlots = $this->allowedSlots($user);

        $decks = Deck::query()
            ->with(['playerDeckCards', 'hero'])
            ->where('user_id', $user->id)
            ->orderBy('slot_number')
            ->orderBy('created_at')
            ->get()
            ->map(fn (Deck $deck): array => $this->formatDeck($deck, $allowedSlots));

        return response()->json([
            'data' => $decks,
            'limits' => [
                'allowed_slots' => $allowedSlots,
                'max_slots' => self::VIP_DECK_LIMIT,
                'membro_vip' => (bool) $user->membro_vip,
            ],
        ]);
    }

    public function show(Request $request, Deck $deck): JsonResponse
    {
        $this->authorizeOwner($request, $deck, allowPreset: true);

        return response()->json([
            'data' => $this->formatDeck($deck->load(['playerDeckCards', 'hero']), $this->allowedSlots($request->user())),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user()->fresh();
        $allowedSlots = $this->allowedSlots($user);
        $slot = $request->integer('slot_number') ?: $this->nextAvailableSlot($user, $allowedSlots);

        if (!$slot || $slot < 1 || $slot > $allowedSlots) {
            return response()->json([
                'message' => $user->membro_vip
                    ? 'Você já usou todos os 8 espaços de baralho.'
                    : 'Jogadores gratuitos podem manter até 2 baralhos. Ative VIP para liberar até 8.',
            ], 422);
        }

        $slotInUse = Deck::query()
            ->where('user_id', $user->id)
            ->where('slot_number', $slot)
            ->exists();

        if ($slotInUse) {
            return response()->json(['message' => 'Este espaço já possui um baralho.'], 422);
        }

        $data = $this->validatedDeckData($request);

        $heroId = $this->heroIdFor($user, $data['hero_id']);

        $deck = DB::transaction(function () use ($user, $data, $slot, $heroId): Deck {
            $deck = Deck::create([
                'user_id' => $user->id,
                'hero_id' => $heroId,
                'slot_number' => $slot,
                'name' => $data['name'],
                'description' => $data['description'] ?? null,
                'is_preset' => false,
                'cover_image' => $data['cover_image'] ?? $this->coverFor($data['cards']),
            ]);

            $this->syncDeckCards($deck, $data['cards']);

            return $deck->load(['playerDeckCards', 'hero']);
        });

        return response()->json([
            'message' => 'Baralho salvo na conta.',
            'data' => $this->formatDeck($deck, $allowedSlots),
        ], 201);
    }

    public function update(Request $request, Deck $deck): JsonResponse
    {
        $this->authorizeOwner($request, $deck);
        $user = $request->user()->fresh();

        if ($this->isLockedForUser($deck, $user)) {
            return response()->json([
                'message' => 'Este baralho está em um espaço VIP bloqueado. Reative VIP para editar ou usar.',
            ], 423);
        }

        $data = $this->validatedDeckData($request);

        $heroId = $this->heroIdFor($user, $data['hero_id']);

        $deck = DB::transaction(function () use ($deck, $data, $heroId): Deck {
            $deck->forceFill([
                'hero_id' => $heroId,
                'name' => $data['name'],
                'description' => $data['description'] ?? null,
                'cover_image' => $data['cover_image'] ?? $this->coverFor($data['cards']),
            ])->save();

            $this->syncDeckCards($deck, $data['cards']);

            return $deck->fresh()->load(['playerDeckCards', 'hero']);
        });

        return response()->json([
            'message' => 'Baralho atualizado.',
            'data' => $this->formatDeck($deck, $this->allowedSlots($user)),
        ]);
    }

    public function destroy(Request $request, Deck $deck): JsonResponse
    {
        $this->authorizeOwner($request, $deck);
        $deck->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    public static function deckLimitFor(User $user): int
    {
        return (bool) $user->membro_vip ? self::VIP_DECK_LIMIT : self::FREE_DECK_LIMIT;
    }

    public static function deckIsLockedFor(User $user, Deck $deck): bool
    {
        return !$deck->is_preset
            && $deck->slot_number !== null
            && (int) $deck->slot_number > self::deckLimitFor($user);
    }

    private function validatedDeckData(Request $request): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'description' => ['nullable', 'string', 'max:500'],
            'cover_image' => ['nullable', 'string', 'max:80'],
            'hero_id' => ['required', 'integer', 'exists:heroes,id'],
            'cards' => ['required', 'array', 'min:1'],
            'cards.*.uid' => ['required', 'string', 'max:40'],
            'cards.*.type' => ['required', 'string', Rule::in(['criatura', 'habilidade', 'item', 'comando', 'cenario'])],
            'cards.*.id' => ['required', 'integer', 'min:1'],
            'cards.*.qty' => ['required', 'integer', 'min:1', 'max:'.self::MAX_COPIES],
        ]);

        $total = collect($data['cards'])->sum(fn (array $card): int => (int) $card['qty']);
        if ($total > self::MAX_CARDS) {
            abort(response()->json(['message' => 'Baralho com mais de 40 cartas.'], 422));
        }

        $normalized = collect($data['cards'])
            ->groupBy('uid')
            ->map(function ($cards): array {
                $first = $cards->first();
                return [
                    'uid' => $first['uid'],
                    'type' => $first['type'],
                    'id' => (int) $first['id'],
                    'qty' => $cards->sum(fn (array $card): int => (int) $card['qty']),
                ];
            })
            ->values();

        if ($normalized->contains(fn (array $card): bool => $card['qty'] > self::MAX_COPIES)) {
            abort(response()->json(['message' => 'Uma carta ultrapassou o limite de 3 cópias.'], 422));
        }

        $owned = $request->user()
            ->playerCards()
            ->whereIn('card_uid', $normalized->pluck('uid'))
            ->get()
            ->keyBy('card_uid');

        foreach ($normalized as $card) {
            if ((int) ($owned[$card['uid']]->quantity ?? 0) < (int) $card['qty']) {
                abort(response()->json([
                    'message' => 'Você não possui cópias suficientes de '.$card['uid'].'.',
                ], 422));
            }
        }

        $data['cards'] = $normalized->all();

        return $data;
    }

    private function syncDeckCards(Deck $deck, array $cards): void
    {
        $deck->playerDeckCards()->delete();

        foreach ($cards as $card) {
            PlayerDeckCard::create([
                'deck_id' => $deck->id,
                'card_uid' => $card['uid'],
                'card_type' => $card['type'],
                'source_id' => $card['id'],
                'quantity' => $card['qty'],
            ]);
        }
    }

    private function formatDeck(Deck $deck, int $allowedSlots): array
    {
        return [
            'id' => $deck->id,
            'slot_number' => $deck->slot_number,
            'locked' => !$deck->is_preset && $deck->slot_number !== null && (int) $deck->slot_number > $allowedSlots,
            'name' => $deck->name,
            'description' => $deck->description,
            'is_preset' => (bool) $deck->is_preset,
            'cover_image' => $deck->cover_image,
            'hero' => $deck->hero ? [
                'id' => $deck->hero->id,
                'key' => $deck->hero->key,
                'name' => $deck->hero->name,
                'race' => $deck->hero->race,
                'avatar_path' => $deck->hero->avatar_path,
            ] : null,
            'cards' => $deck->playerDeckCards
                ->map(fn (PlayerDeckCard $card): array => [
                    'uid' => $card->card_uid,
                    'type' => $card->card_type,
                    'id' => $card->source_id,
                    'qty' => $card->quantity,
                ])
                ->values(),
        ];
    }

    private function authorizeOwner(Request $request, Deck $deck, bool $allowPreset = false): void
    {
        abort_if(
            (int) $deck->user_id !== (int) $request->user()->id && (!$allowPreset || !$deck->is_preset),
            403,
            'Baralho indisponível para este jogador.'
        );
    }

    private function allowedSlots(User $user): int
    {
        return self::deckLimitFor($user);
    }

    private function isLockedForUser(Deck $deck, User $user): bool
    {
        return self::deckIsLockedFor($user, $deck);
    }

    private function nextAvailableSlot(User $user, int $allowedSlots): ?int
    {
        $used = Deck::query()
            ->where('user_id', $user->id)
            ->whereNotNull('slot_number')
            ->pluck('slot_number')
            ->map(fn ($slot): int => (int) $slot)
            ->all();

        for ($slot = 1; $slot <= $allowedSlots; $slot++) {
            if (!in_array($slot, $used, true)) return $slot;
        }

        return null;
    }

    private function coverFor(array $cards): ?string
    {
        $card = collect($cards)->firstWhere('type', 'criatura') ?? $cards[0] ?? null;
        return $card ? sprintf('%02d.png', (int) $card['id']) : null;
    }

    private function heroIdFor(User $user, int $heroId): int
    {
        abort_unless(
            $user->heroes()->whereKey($heroId)->exists(),
            422,
            'O herói escolhido não pertence à sua coleção.'
        );

        return $heroId;
    }
}
