<?php

namespace App\Http\Controllers;

use App\Models\Deck;
use App\Models\Hero;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class HeroController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $ownedKeys = $request->user()->heroes()->pluck('heroes.key')->all();

        return response()->json([
            'data' => Hero::query()
                ->orderBy('display_order')
                ->get()
                ->map(fn (Hero $hero) => $this->serializeHero($hero, in_array($hero->key, $ownedKeys, true)))
                ->values(),
        ]);
    }

    public function chooseInitial(Request $request): JsonResponse
    {
        $data = $request->validate([
            'hero_key' => ['required', 'string', Rule::exists('heroes', 'key')],
        ]);

        $result = DB::transaction(function () use ($request, $data): array {
            $user = $request->user()->newQuery()->lockForUpdate()->findOrFail($request->user()->id);
            if ($user->initial_hero_chosen_at) {
                abort(422, 'Você já escolheu seu herói inicial.');
            }

            $hero = Hero::query()->where('key', $data['hero_key'])->firstOrFail();
            $deck = Deck::query()
                ->where('user_id', $user->id)
                ->orderBy('slot_number')
                ->orderBy('id')
                ->lockForUpdate()
                ->first();

            if (!$deck) {
                abort(422, 'Escolha um baralho inicial antes de escolher seu herói.');
            }

            $user->heroes()->syncWithoutDetaching([
                $hero->id => ['unlocked_at' => now()],
            ]);
            $deck->forceFill(['hero_id' => $hero->id])->save();
            $user->forceFill([
                'hero_id' => $hero->id,
                'initial_hero_chosen_at' => now(),
            ])->save();

            return [
                'user' => $user->fresh('initialHero'),
                'hero' => $hero,
                'deck' => $deck->fresh('hero'),
            ];
        });

        return response()->json([
            'message' => 'Herói inicial escolhido e vinculado ao seu primeiro baralho.',
            'user' => $result['user'],
            'hero' => $this->serializeHero($result['hero'], true),
            'deck' => $result['deck'],
        ]);
    }

    private function serializeHero(Hero $hero, bool $owned): array
    {
        return [
            'id' => $hero->id,
            'key' => $hero->key,
            'name' => $hero->name,
            'race' => $hero->race,
            'element' => $hero->element,
            'effect_name' => $hero->effect_name,
            'effect_description' => $hero->effect_description,
            'story' => $hero->story,
            'avatar_path' => $hero->avatar_path,
            'owned' => $owned,
        ];
    }
}
