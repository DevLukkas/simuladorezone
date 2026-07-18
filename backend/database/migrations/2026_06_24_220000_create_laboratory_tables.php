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
            $table->unsignedInteger('card_essences')->default(0)->after('ez_coins');
        });

        Schema::create('lab_rarity_rates', function (Blueprint $table): void {
            $table->id();
            $table->string('rarity', 30)->unique();
            $table->unsignedInteger('duration_minutes');
            $table->decimal('chance_percent', 5, 2);
            $table->timestamps();
        });

        Schema::create('lab_craft_recipes', function (Blueprint $table): void {
            $table->id();
            $table->string('recipe_key', 60)->unique();
            $table->string('name');
            $table->string('card_type', 40);
            $table->boolean('requires_element')->default(false);
            $table->unsignedInteger('essence_cost');
            $table->timestamps();
        });

        Schema::create('lab_craft_projects', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('lab_craft_recipe_id')->constrained()->cascadeOnDelete();
            $table->string('status', 30)->default('crafting');
            $table->string('selected_element', 30)->nullable();
            $table->string('result_rarity', 30);
            $table->string('result_card_uid', 60)->nullable();
            $table->timestamp('started_at');
            $table->timestamp('completes_at');
            $table->timestamp('claimed_at')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();
        });

        DB::table('lab_rarity_rates')->insert([
            ['rarity' => 'comum', 'duration_minutes' => 1, 'chance_percent' => 66.70, 'created_at' => now(), 'updated_at' => now()],
            ['rarity' => 'rara', 'duration_minutes' => 60, 'chance_percent' => 33.00, 'created_at' => now(), 'updated_at' => now()],
            ['rarity' => 'lendaria', 'duration_minutes' => 300, 'chance_percent' => 0.30, 'created_at' => now(), 'updated_at' => now()],
        ]);

        DB::table('lab_craft_recipes')->insert([
            ['recipe_key' => 'command_any', 'name' => 'Carta comando', 'card_type' => 'comando', 'requires_element' => false, 'essence_cost' => 130, 'created_at' => now(), 'updated_at' => now()],
            ['recipe_key' => 'ability_element', 'name' => 'Habilidade de elemento', 'card_type' => 'habilidade', 'requires_element' => true, 'essence_cost' => 150, 'created_at' => now(), 'updated_at' => now()],
            ['recipe_key' => 'ability_any', 'name' => 'Habilidade avulsa', 'card_type' => 'habilidade', 'requires_element' => false, 'essence_cost' => 80, 'created_at' => now(), 'updated_at' => now()],
            ['recipe_key' => 'scenario_any', 'name' => 'Cenario', 'card_type' => 'cenario', 'requires_element' => false, 'essence_cost' => 250, 'created_at' => now(), 'updated_at' => now()],
            ['recipe_key' => 'creature_any', 'name' => 'Criatura', 'card_type' => 'criatura', 'requires_element' => false, 'essence_cost' => 105, 'created_at' => now(), 'updated_at' => now()],
            ['recipe_key' => 'creature_element', 'name' => 'Criatura de elemento', 'card_type' => 'criatura', 'requires_element' => true, 'essence_cost' => 180, 'created_at' => now(), 'updated_at' => now()],
            ['recipe_key' => 'item_any', 'name' => 'Item', 'card_type' => 'item', 'requires_element' => false, 'essence_cost' => 150, 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('lab_craft_projects');
        Schema::dropIfExists('lab_craft_recipes');
        Schema::dropIfExists('lab_rarity_rates');
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('card_essences');
        });
    }
};
