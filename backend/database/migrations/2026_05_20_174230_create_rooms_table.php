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
        Schema::create('rooms', function (Blueprint $table) {
            $table->id();
            $table->string('room_code', 8)->unique(); // ID da sala ex: EZ-4X9K
            $table->foreignId('host_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('guest_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('host_deck_id')->nullable()->constrained('decks')->nullOnDelete();
            $table->foreignId('guest_deck_id')->nullable()->constrained('decks')->nullOnDelete();
            $table->string('status')->default('waiting'); // waiting, starting, in_progress, finished
            $table->json('game_state')->nullable(); // estado atual da partida
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('rooms');
    }
};
