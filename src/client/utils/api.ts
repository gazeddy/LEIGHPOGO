export const fetchPokemons = async () => {
    const response = await fetch('/api/pokemons');
    if (!response.ok) {
        throw new Error('Failed to fetch Pokémon data');
    }
    return response.json();
};

export const fetchRaids = async () => {
    const response = await fetch('/api/raids');
    if (!response.ok) {
        throw new Error('Failed to fetch raid data');
    }
    return response.json();
};

export const postRaid = async (raidData) => {
    const response = await fetch('/api/raids', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(raidData),
    });
    if (!response.ok) {
        throw new Error('Failed to post raid data');
    }
    return response.json();
};

export const registerUser = async (userData) => {
    const response = await fetch('/api/users/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
    });
    if (!response.ok) {
        throw new Error('Failed to register user');
    }
    return response.json();
};

export const loginUser = async (credentials) => {
    const response = await fetch('/api/users/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
    });
    if (!response.ok) {
        throw new Error('Failed to login user');
    }
    return response.json();
};