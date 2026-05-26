<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('cards', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('card_type'); // creature, spell, trap, etc.
            $table->integer('mana_cost')->default(0);
            $table->integer('attack')->nullable();
            $table->integer('defense')->nullable();
            $table->text('description')->nullable();
            $table->string('image_path')->nullable();
            $table->string('rarity')->default('common'); // common, rare, epic, legendary
            $table->json('effects')->nullable(); // efeitos especiais em JSON
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cards');
    }
};
