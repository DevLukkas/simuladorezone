<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthRegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_creates_user_without_logging_in(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Jogador Beta',
            'email' => 'beta@example.com',
            'password' => 'secret123',
        ]);

        $response
            ->assertCreated()
            ->assertJsonMissingPath('token')
            ->assertJsonPath('user.email', 'beta@example.com');

        $user = User::where('email', 'beta@example.com')->firstOrFail();

        $this->assertSame('Jogador Beta', $user->name);
        $this->assertTrue(Hash::check('secret123', $user->password));
    }

    public function test_registered_user_can_login_after_registration(): void
    {
        $this->postJson('/api/auth/register', [
            'name' => 'Jogador Beta',
            'email' => 'beta@example.com',
            'password' => 'secret123',
        ])->assertCreated();

        $response = $this->postJson('/api/auth/login', [
            'email' => 'beta@example.com',
            'password' => 'secret123',
        ]);

        $response
            ->assertOk()
            ->assertJsonStructure(['token', 'user'])
            ->assertJsonPath('user.email', 'beta@example.com');
    }
}
