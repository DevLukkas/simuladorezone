<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_inventory_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('item_key', 60);
            $table->string('item_type', 40);
            $table->unsignedInteger('quantity')->default(0);
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'item_key']);
        });

        Schema::create('shop_purchases', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('item_key', 60);
            $table->string('item_type', 40);
            $table->unsignedInteger('quantity')->default(1);
            $table->unsignedInteger('unit_price_ez_coins');
            $table->unsignedInteger('total_price_ez_coins');
            $table->json('payload')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shop_purchases');
        Schema::dropIfExists('user_inventory_items');
    }
};
