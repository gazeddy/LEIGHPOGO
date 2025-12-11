import React from 'react';

const HomePage: React.FC = () => {
    return (
        <div>
            <h1>Welcome to the Pokémon Go Community!</h1>
            <p>Join us to share tips, coordinate raids, and connect with fellow trainers!</p>
            <a href="/map">View Pokémon Locations</a>
            <a href="/community">Join the Community Discussions</a>
        </div>
    );
};

export default HomePage;