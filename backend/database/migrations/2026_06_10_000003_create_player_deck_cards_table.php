<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('player_deck_cards', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('deck_id')->constrained()->cascadeOnDelete();
            $table->string('card_uid', 40);
            $table->string('card_type', 30);
            $table->unsignedInteger('source_id');
            $table->unsignedTinyInteger('quantity')->default(1);
            $table->timestamps();

            $table->unique(['deck_id', 'card_uid']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('player_deck_cards');
    }
};
