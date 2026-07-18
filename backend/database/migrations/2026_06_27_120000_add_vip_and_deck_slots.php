<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('membro_vip')->default(false)->after('card_essences');
        });

        Schema::table('decks', function (Blueprint $table): void {
            $table->unsignedTinyInteger('slot_number')->nullable()->after('user_id');
        });

        $decksByUser = DB::table('decks')
            ->whereNotNull('user_id')
            ->orderBy('user_id')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get()
            ->groupBy('user_id');

        foreach ($decksByUser as $decks) {
            $slot = 1;
            foreach ($decks as $deck) {
                DB::table('decks')->where('id', $deck->id)->update(['slot_number' => $slot]);
                $slot++;
            }
        }

        Schema::table('decks', function (Blueprint $table): void {
            $table->unique(['user_id', 'slot_number']);
        });
    }

    public function down(): void
    {
        Schema::table('decks', function (Blueprint $table): void {
            $table->dropUnique(['user_id', 'slot_number']);
            $table->dropColumn('slot_number');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('membro_vip');
        });
    }
};
