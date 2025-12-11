import React from 'react';

const Header: React.FC = () => {
    return (
        <header>
            <h1>Pokémon Go Community</h1>
            <nav>
                <ul>
                    <li><a href="/">Home</a></li>
                    <li><a href="/map">Map</a></li>
                    <li><a href="/community">Community</a></li>
                </ul>
            </nav>
        </header>
    );
};

export default Header;