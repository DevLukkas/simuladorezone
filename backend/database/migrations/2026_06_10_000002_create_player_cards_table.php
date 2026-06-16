<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('player_cards', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('card_uid', 40);
            $table->string('card_type', 30);
            $table->unsignedInteger('source_id');
            $table->unsignedSmallInteger('quantity')->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'card_uid']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('player_cards');
    }
};
