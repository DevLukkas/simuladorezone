<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('friendships', function (Blueprint $table): void {
            $table->timestamp('last_gift_sent_at')->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('friendships', function (Blueprint $table): void {
            $table->dropColumn('last_gift_sent_at');
        });
    }
};
