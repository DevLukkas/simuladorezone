<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('starter_deck_key')->nullable()->after('password');
            $table->timestamp('starter_deck_chosen_at')->nullable()->after('starter_deck_key');
            $table->unsignedInteger('crystals')->default(0)->after('starter_deck_chosen_at');
            $table->unsignedInteger('ez_coins')->default(0)->after('crystals');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn([
                'starter_deck_key',
                'starter_deck_chosen_at',
                'crystals',
                'ez_coins',
            ]);
        });
    }
};
