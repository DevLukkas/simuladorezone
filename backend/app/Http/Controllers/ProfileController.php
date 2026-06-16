<?php

namespace App\Http\Controllers;

use App\Models\Friendship;
use App\Models\SharedDeckBuild;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->user()->fresh();

        return response()->json([
            'user' => $user,
            'friends' => $this->friendsFor($user),
            'shared_builds' => $this->sharedBuilds($request->user(), $user),
            'season' => $this->seasonData($user),
        ]);
    }

    public function publicShow(Request $request, User $user): JsonResponse
    {
        return response()->json([
            'user' => $user->fresh(),
            'friends' => [],
            'shared_builds' => $this->sharedBuilds($request->user(), $user),
            'season' => $this->seasonData($user),
            'is_public_view' => (int) $request->user()->id !== (int) $user->id,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'avatar_card_id' => ['sometimes', 'integer', Rule::in([3, 30, 32, 34])],
            'avatar_url' => ['sometimes', 'nullable', 'string', 'max:200000'],
        ]);

        $request->user()->forceFill($data)->save();

        return response()->json([
            'user' => $request->user()->fresh(),
        ]);
    }

    public function uploadAvatar(Request $request): JsonResponse
    {
        $data = $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:4096'],
        ]);

        $user = $request->user();

        if ($user->avatar_url && str_starts_with($user->avatar_url, '/storage/avatars/')) {
            return response()->json([
                'message' => 'Você já possui uma foto de avatar enviada. Use a foto atual ou restaure o padrão antes de enviar outra.',
            ], 422);
        }

        $path = $data['avatar']->store('avatars', 'public');
        $user->forceFill([
            'avatar_url' => '/storage/'.$path,
        ])->save();

        return response()->json([
            'user' => $user->fresh(),
        ]);
    }

    public function addFriend(Request $request): JsonResponse
    {
        $data = $request->validate([
            'query' => ['required', 'string', 'max:255'],
        ]);

        $user = $request->user();
        $friend = User::query()
            ->where('id', '!=', $user->id)
            ->where(fn ($query) => $query
                ->where('email', $data['query'])
                ->orWhere('name', $data['query']))
            ->first();

        if (!$friend) {
            return response()->json(['message' => 'Jogador não encontrado.'], 404);
        }

        DB::transaction(function () use ($user, $friend): void {
            Friendship::firstOrCreate([
                'user_id' => $user->id,
                'friend_id' => $friend->id,
            ], ['status' => 'accepted']);

            Friendship::firstOrCreate([
                'user_id' => $friend->id,
                'friend_id' => $user->id,
            ], ['status' => 'accepted']);
        });

        return response()->json([
            'friends' => $this->friendsFor($user->fresh()),
        ]);
    }

    public function removeFriend(Request $request, User $friend): JsonResponse
    {
        $user = $request->user();

        Friendship::query()
            ->where(fn ($query) => $query
                ->where('user_id', $user->id)
                ->where('friend_id', $friend->id))
            ->orWhere(fn ($query) => $query
                ->where('user_id', $friend->id)
                ->where('friend_id', $user->id))
            ->delete();

        return response()->json([
            'friends' => $this->friendsFor($user->fresh()),
        ]);
    }

    public function sendGift(Request $request, User $friend): JsonResponse
    {
        $user = $request->user();
        $friendship = $user->friendships()
            ->where('friend_id', $friend->id)
            ->where('status', 'accepted')
            ->first();

        if (!$friendship) {
            return response()->json(['message' => 'Este jogador não está na sua lista de amigos.'], 422);
        }

        $now = now();
        $latestReset = $now->copy()->setTime(0, 1);
        if ($now->lt($latestReset)) {
            $latestReset->subDay();
        }
        $nextReset = $latestReset->copy()->addDay();

        if ($friendship->last_gift_sent_at && $friendship->last_gift_sent_at->gte($latestReset)) {
            return response()->json([
                'message' => 'Você já enviou presente para este amigo hoje. Libera novamente às '.$nextReset->format('H:i').'.',
                'next_gift_at' => $nextReset,
            ], 422);
        }

        $friendship->forceFill(['last_gift_sent_at' => $now])->save();
        $user->increment('gifts_sent');

        return response()->json([
            'message' => 'Presente enviado.',
            'user' => $user->fresh(),
        ]);
    }

    public function shareBuild(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'deck_id' => ['nullable', 'integer', 'exists:decks,id'],
            'cover_image' => ['nullable', 'string', 'max:255'],
            'decklist' => ['nullable', 'array'],
        ]);

        $sharedCount = SharedDeckBuild::query()
            ->where('user_id', $request->user()->id)
            ->where('is_public', true)
            ->count();

        if ($sharedCount >= 3) {
            return response()->json([
                'message' => 'Você já compartilhou 3 builds. Apague uma build antiga para compartilhar outra.',
            ], 422);
        }

        SharedDeckBuild::create([
            ...$data,
            'user_id' => $request->user()->id,
            'is_public' => true,
        ]);

        return response()->json([
            'shared_builds' => $this->sharedBuilds($request->user(), $request->user()),
        ], 201);
    }

    public function voteBuild(Request $request, SharedDeckBuild $build): JsonResponse
    {
        $data = $request->validate([
            'rating' => ['required', 'integer', 'min:0', 'max:10'],
        ]);

        $build->increment('votes_count');
        $build->increment('votes_sum', $data['rating']);

        return response()->json([
            'build' => $this->formatBuild($build->fresh()->load('user')),
        ]);
    }

    public function exportBuild(SharedDeckBuild $build): JsonResponse
    {
        $build->increment('downloads');

        return response()->json([
            'build' => $this->formatBuild($build->fresh()->load('user')),
            'decklist' => $build->decklist ?? [],
        ]);
    }

    public function deleteBuild(Request $request, SharedDeckBuild $build): JsonResponse
    {
        if ((int) $build->user_id !== (int) $request->user()->id) {
            return response()->json([
                'message' => 'Você só pode apagar builds compartilhadas por você.',
            ], 403);
        }

        $build->delete();

        return response()->json([
            'shared_builds' => $this->sharedBuilds($request->user(), $request->user()),
        ]);
    }

    private function friendsFor(User $user)
    {
        return $user->friendships()
            ->with('friend')
            ->where('status', 'accepted')
            ->get()
            ->map(fn (Friendship $friendship): array => [
                'id' => $friendship->friend->id,
                'name' => $friendship->friend->name,
                'avatar_card_id' => $friendship->friend->avatar_card_id ?? 3,
                'ranking_position' => $friendship->friend->ranking_position,
                'ranking_points' => $friendship->friend->ranking_points ?? 0,
                'wins' => $friendship->friend->wins ?? 0,
                'online' => false,
                'last_gift_sent_at' => $friendship->last_gift_sent_at,
                'can_send_gift' => $this->canSendGift($friendship),
            ])
            ->values();
    }

    private function canSendGift(Friendship $friendship): bool
    {
        if (!$friendship->last_gift_sent_at) {
            return true;
        }

        $now = now();
        $latestReset = $now->copy()->setTime(0, 1);
        if ($now->lt($latestReset)) {
            $latestReset->subDay();
        }

        return $friendship->last_gift_sent_at->lt($latestReset);
    }

    private function sharedBuilds(?User $viewer = null, ?User $owner = null)
    {
        $query = SharedDeckBuild::query()
            ->with('user')
            ->where('is_public', true);

        if ($owner) {
            $query->where('user_id', $owner->id);
        }

        return $query
            ->latest()
            ->limit(3)
            ->get()
            ->map(fn (SharedDeckBuild $build): array => $this->formatBuild($build, $viewer))
            ->values();
    }

    private function formatBuild(SharedDeckBuild $build, ?User $viewer = null): array
    {
        $rating = $build->votes_count > 0
            ? round($build->votes_sum / $build->votes_count, 1)
            : 0.0;

        return [
            'id' => $build->id,
            'user_id' => $build->user_id,
            'name' => $build->name,
            'author' => $build->user?->name ?? 'Jogador',
            'cover_image' => $build->cover_image,
            'decklist' => $build->decklist ?? [],
            'downloads' => $build->downloads,
            'votes_count' => $build->votes_count,
            'rating' => $rating,
            'is_owner' => $viewer ? (int) $viewer->id === (int) $build->user_id : false,
        ];
    }

    private function seasonData(User $user): array
    {
        return [
            'name' => 'Temporada 1 - Ascensão Elemental',
            'achievements' => [
                ['id' => 5, 'title' => 'Primeira Vitória', 'state' => ($user->wins ?? 0) > 0 ? 'Concluída' : 'Bloqueada'],
                ['id' => 16, 'title' => 'Colecionador', 'state' => $user->playerCards()->count() . '/25 cartas'],
                ['id' => 20, 'title' => 'Arena Solo', 'state' => ($user->wins ?? 0) . '/5 vitórias'],
                ['id' => 45, 'title' => 'Estrategista', 'state' => 'Em breve'],
            ],
        ];
    }
}
