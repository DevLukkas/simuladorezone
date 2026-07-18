<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\DeckController;
use App\Http\Controllers\GameActionController;
use App\Http\Controllers\LaboratoryController;
use App\Http\Controllers\PlayerCollectionController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\RoomController;
use App\Http\Controllers\ShopController;
use App\Http\Controllers\StarterDeckController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
    });
});

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/starter-decks', [StarterDeckController::class, 'index']);
    Route::post('/starter-decks/choose', [StarterDeckController::class, 'choose']);
    Route::get('/player-cards', [PlayerCollectionController::class, 'index']);
    Route::get('/laboratory', [LaboratoryController::class, 'status']);
    Route::post('/laboratory/dissolve', [LaboratoryController::class, 'dissolve']);
    Route::post('/laboratory/craft', [LaboratoryController::class, 'craft']);
    Route::post('/laboratory/projects/{project}/accelerate', [LaboratoryController::class, 'accelerate']);
    Route::post('/laboratory/projects/{project}/claim', [LaboratoryController::class, 'claim']);
    Route::post('/laboratory/boosters/buy', [LaboratoryController::class, 'buyBooster']);
    Route::get('/shop/inventory', [ShopController::class, 'inventory']);
    Route::post('/shop/purchase', [ShopController::class, 'purchase']);
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::get('/profile/users/{user}', [ProfileController::class, 'publicShow']);
    Route::patch('/profile', [ProfileController::class, 'update']);
    Route::post('/profile/avatar', [ProfileController::class, 'uploadAvatar']);
    Route::post('/profile/friends', [ProfileController::class, 'addFriend']);
    Route::delete('/profile/friends/{friend}', [ProfileController::class, 'removeFriend']);
    Route::post('/profile/friends/{friend}/gift', [ProfileController::class, 'sendGift']);
    Route::post('/profile/shared-builds', [ProfileController::class, 'shareBuild']);
    Route::delete('/profile/shared-builds/{build}', [ProfileController::class, 'deleteBuild']);
    Route::post('/profile/shared-builds/{build}/vote', [ProfileController::class, 'voteBuild']);
    Route::post('/profile/shared-builds/{build}/export', [ProfileController::class, 'exportBuild']);

    Route::get('/decks', [DeckController::class, 'index']);
    Route::post('/decks', [DeckController::class, 'store']);
    Route::get('/decks/{deck}', [DeckController::class, 'show']);
    Route::put('/decks/{deck}', [DeckController::class, 'update']);
    Route::delete('/decks/{deck}', [DeckController::class, 'destroy']);

    Route::get('/rooms', [RoomController::class, 'index']);
    Route::post('/rooms', [RoomController::class, 'store']);
    Route::post('/rooms/join', [RoomController::class, 'join']);
    Route::get('/rooms/code/{code}', [RoomController::class, 'byCode']);
    Route::get('/rooms/{room}', [RoomController::class, 'show']);
    Route::post('/rooms/{room}/ready', [RoomController::class, 'ready']);
    Route::post('/rooms/{room}/start', [RoomController::class, 'start']);
    Route::post('/rooms/{room}/finish', [RoomController::class, 'finish']);
    Route::delete('/rooms/{room}', [RoomController::class, 'destroy']);
    Route::post('/rooms/{room}/actions', [GameActionController::class, 'store']);
    Route::post('/rooms/{room}/action', [GameActionController::class, 'store']);
});
