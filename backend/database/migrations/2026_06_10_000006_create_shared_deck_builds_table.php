<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shared_deck_builds', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('deck_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('cover_image')->nullable();
            $table->json('decklist')->nullable();
            $table->unsignedInteger('downloads')->default(0);
            $table->unsignedInteger('votes_count')->default(0);
            $table->unsignedInteger('votes_sum')->default(0);
            $table->boolean('is_public')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shared_deck_builds');
    }
};
