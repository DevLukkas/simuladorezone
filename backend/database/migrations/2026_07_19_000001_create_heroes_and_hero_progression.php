<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('heroes', function (Blueprint $table): void {
            $table->id();
            $table->string('key')->unique();
            $table->string('name');
            $table->string('race');
            $table->string('element')->nullable();
            $table->string('effect_name');
            $table->text('effect_description');
            $table->text('story');
            $table->string('avatar_path')->nullable();
            $table->unsignedTinyInteger('display_order')->default(0);
            $table->timestamps();
        });

        $now = now();
        DB::table('heroes')->insert([
            [
                'key' => 'tennor', 'name' => 'Tennor', 'race' => 'Humano', 'element' => null,
                'effect_name' => 'Mestre das Habilidades',
                'effect_description' => 'Quando anexar uma carta de habilidade, revele a carta do topo do baralho. Se for uma habilidade do mesmo elemento da carta anexada, a criatura alvo recebe +1/+0.',
                'story' => 'Tennor aprendeu a transformar o estudo dos elementos em estratégia. Entre bibliotecas queimadas e campos de batalha, ele conduz seus aliados pela precisão, não pela força bruta.',
                'avatar_path' => '/assets/heroes/avatar_heroi_tennor.png', 'display_order' => 1, 'created_at' => $now, 'updated_at' => $now,
            ],
            [
                'key' => 'ispisher', 'name' => 'Ispisher', 'race' => 'Tritão', 'element' => 'agua',
                'effect_name' => 'Maré Restauradora',
                'effect_description' => 'No início do seu turno, cure 1 de vida de uma criatura aliada com a menor vida.',
                'story' => 'Guardião das correntes profundas, Ispisher abandonou o seu recife quando as águas de Tialnnyr começaram a adoecer. Onde ele passa, os feridos encontram uma segunda maré.',
                'avatar_path' => '/assets/heroes/avatar_heroi_ispisher.png', 'display_order' => 2, 'created_at' => $now, 'updated_at' => $now,
            ],
            [
                'key' => 'gimlou', 'name' => 'Gimlou', 'race' => 'Goblin', 'element' => 'fogo',
                'effect_name' => 'Marca da Emboscada',
                'effect_description' => 'Quando um Goblin aliado atacar e a criatura inimiga sobreviver ao combate, ela recebe um contador de -1/0. Máximo de 5 contadores por criatura.',
                'story' => 'Gimlou fez seu nome reunindo clãs que brigavam até por sobras de pólvora. Seu exército não vence pela elegância: vence porque cada sobrevivente carrega uma nova cicatriz.',
                'avatar_path' => '/assets/heroes/avatar_heroi_gimlou.png', 'display_order' => 3, 'created_at' => $now, 'updated_at' => $now,
            ],
            [
                'key' => 'badur', 'name' => 'Badur', 'race' => 'Besta', 'element' => 'terra',
                'effect_name' => 'Pele de Pedra',
                'effect_description' => 'Criaturas aliadas do elemento Terra recebem +1 de vida máxima ao entrar em campo.',
                'story' => 'Badur protege os caminhos de pedra que ligam as tribos bestiais. Dizem que a montanha reconhece seus passos e endurece a pele de quem luta ao seu lado.',
                'avatar_path' => '/assets/heroes/avatar_heroi_badur.png', 'display_order' => 4, 'created_at' => $now, 'updated_at' => $now,
            ],
            [
                'key' => 'morgon', 'name' => 'Morgon', 'race' => 'Espectro', 'element' => null,
                'effect_name' => 'Legião dos Esquecidos',
                'effect_description' => 'Quando uma criatura aliada morrer, gere um token Espectro 1/1 se houver espaço disponível.',
                'story' => 'Morgon não comanda mortos por crueldade, mas por promessa. Cada espírito que responde ao seu chamado recebeu uma chance de terminar uma guerra que a vida interrompeu.',
                'avatar_path' => '/assets/heroes/avatar_heroi_morgon.png', 'display_order' => 5, 'created_at' => $now, 'updated_at' => $now,
            ],
        ]);

        Schema::table('users', function (Blueprint $table): void {
            $table->foreignId('hero_id')->nullable()->after('starter_deck_chosen_at')->constrained('heroes')->nullOnDelete();
            $table->timestamp('initial_hero_chosen_at')->nullable()->after('hero_id');
        });

        Schema::table('decks', function (Blueprint $table): void {
            $table->foreignId('hero_id')->nullable()->after('user_id')->constrained('heroes')->nullOnDelete();
        });

        Schema::create('user_heroes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('hero_id')->constrained('heroes')->cascadeOnDelete();
            $table->timestamp('unlocked_at');
            $table->timestamps();
            $table->unique(['user_id', 'hero_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_heroes');

        Schema::table('decks', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('hero_id');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('initial_hero_chosen_at');
            $table->dropConstrainedForeignId('hero_id');
        });

        Schema::dropIfExists('heroes');
    }
};
