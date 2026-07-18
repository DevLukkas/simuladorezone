<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('player_cards', function (Blueprint $table): void {
            $table->string('nome_card')->nullable()->after('card_uid');
        });

        foreach (config('card_catalog.cards', []) as $uid => $card) {
            DB::table('player_cards')
                ->where('card_uid', $uid)
                ->update(['nome_card' => $card['name'] ?? null]);
        }
    }

    public function down(): void
    {
        Schema::table('player_cards', function (Blueprint $table): void {
            $table->dropColumn('nome_card');
        });
    }
};
