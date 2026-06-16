<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->unsignedInteger('avatar_card_id')->default(3)->after('ez_coins');
            $table->unsignedInteger('level')->default(1)->after('avatar_card_id');
            $table->unsignedInteger('ranking_points')->default(0)->after('level');
            $table->unsignedInteger('ranking_position')->nullable()->after('ranking_points');
            $table->unsignedInteger('wins')->default(0)->after('ranking_position');
            $table->unsignedInteger('losses')->default(0)->after('wins');
            $table->unsignedInteger('gifts_sent')->default(0)->after('losses');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn([
                'avatar_card_id',
                'level',
                'ranking_points',
                'ranking_position',
                'wins',
                'losses',
                'gifts_sent',
            ]);
        });
    }
};
