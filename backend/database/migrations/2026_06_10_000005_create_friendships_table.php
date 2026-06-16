<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('friendships', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('friend_id')->constrained('users')->cascadeOnDelete();
            $table->string('status', 24)->default('accepted');
            $table->timestamps();

            $table->unique(['user_id', 'friend_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('friendships');
    }
};
