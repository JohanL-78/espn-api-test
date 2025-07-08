const fs = require('fs');
const path = require('path');

// Configuration
const ESPN_API = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete';
const DATA_DIR = 'data';
const CURRENT_SEASON = '2025';

// Créer le dossier data s'il n'existe pas
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Fonction pour fetch les données ESPN (adaptée pour Node.js)
async function fetchESPNData(sortBy = 'offensive.avgPoints:desc', limit = 100, season = CURRENT_SEASON) {
    const params = new URLSearchParams({
        region: 'gb',
        lang: 'en',
        contentorigin: 'espn',
        isqualified: 'false',
        page: '1',
        limit: limit.toString(),
        sort: sortBy,
        season: season,
        seasontype: '2'  // Regular season
    });
    
    const url = `${ESPN_API}?${params}`;
    
    try {
        console.log(`🔗 Fetching: ${url}`);
        console.log(`📊 Parameters: Season ${season}, Limit ${limit}, Sort ${sortBy}`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`✅ Successfully fetched ${data.athletes?.length || 0} players`);
        
        return data;
    } catch (error) {
        console.error('❌ Fetch error:', error);
        throw error;
    }
}

// Parser les données des joueurs (VERSION CORRIGÉE - même logique que HTML local)
function parsePlayerData(playerData, globalCategories = []) {
    const athlete = playerData.athlete || {};
    const team = athlete.team || {};
    
    const player = {
        id: athlete.id || 'unknown',
        name: athlete.displayName || 'Unknown Player',
        shortName: athlete.shortName || '',
        debutYear: athlete.debutYear || null,
        team: athlete.teamShortName || athlete.teamName || 'N/A',  // ✅ FIX: même logique que version locale
        teamShortName: team.shortDisplayName || team.abbreviation || 'N/A',
        teamAbbr: team.abbreviation || 'N/A',
        position: athlete.position?.displayName || 'N/A',
        
        // 📸 CORRECTION : même logique que fichier HTML local qui marche
        photo: athlete.headshot?.href || null,
        logo: athlete.teamLogos?.[0]?.href || null,  // ✅ FIX: utilise athlete.teamLogos comme dans votre version locale
        teamColor: team.color || null,
        teamAlternateColor: team.alternateColor || null
    };
    
    // 🔍 Debug pour voir la structure des données
    if (process.env.NODE_ENV !== 'production') {
        console.log(`🔍 Player: ${player.name}`);
        console.log(`📸 Photo: ${player.photo ? 'Found' : 'Missing'}`);
        console.log(`🏆 Logo: ${player.logo ? 'Found' : 'Missing'}`);
        console.log(`🏀 TeamLogos array length: ${athlete.teamLogos?.length || 0}`);
        if (athlete.teamLogos && athlete.teamLogos.length > 0) {
            console.log(`🏆 First logo URL: ${athlete.teamLogos[0]?.href}`);
        }
    }
    
    // Parser les catégories de stats (code existant inchangé)
    if (playerData.categories && Array.isArray(playerData.categories)) {
        playerData.categories.forEach((playerCategory) => {
            // Trouver la définition globale correspondante
            const globalCategory = globalCategories.find(gc => gc.name === playerCategory.name);
            
            if (globalCategory && globalCategory.displayNames && playerCategory.values) {
                globalCategory.displayNames.forEach((statName, index) => {
                    const value = playerCategory.values[index];
                    if (value !== undefined) {
                        const key = `${playerCategory.name}_${statName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
                        player[key] = value;
                    }
                });
            } else if (playerCategory.values) {
                // Fallback : utiliser les valeurs avec des indices
                playerCategory.values.forEach((value, index) => {
                    const key = `${playerCategory.name}_stat_${index}`;
                    player[key] = value;
                });
            }
        });
    }
    
    return player;
}

// Fonction pour valider et nettoyer les URLs d'images
function validateImageUrl(url) {
    if (!url || typeof url !== 'string') return null;
    
    // Vérifier que c'est bien une URL
    try {
        new URL(url);
        // Vérifier que c'est une image
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
        const hasImageExtension = imageExtensions.some(ext => url.toLowerCase().includes(ext));
        
        if (hasImageExtension || url.includes('headshot') || url.includes('logo')) {
            return url;
        }
    } catch (error) {
        console.log(`⚠️ Invalid URL: ${url}`);
    }
    
    return null;
}

// Fonction principale pour scraper les top scorers (VERSION CORRIGÉE)
async function scrapeTop50Scorers() {
    console.log('🏆 Starting NBA Top 50 Scorers scrape...');
    
    try {
        const data = await fetchESPNData('offensive.avgPoints:desc', 50, CURRENT_SEASON);
        const globalCategories = data.categories || [];
        const players = data.athletes.map(playerData => parsePlayerData(playerData, globalCategories));
        
        // 📊 Calculer des stats résumées
        const avgPoints = players.reduce((sum, p) => sum + (p.offensive_points_per_game || 0), 0) / players.length;
        const players25Plus = players.filter(p => (p.offensive_points_per_game || 0) >= 25).length;
        const players30Plus = players.filter(p => (p.offensive_points_per_game || 0) >= 30).length;
        
        // 📸 Stats sur les images (CORRIGÉ : utilise 'logo' au lieu de 'teamLogo')
        const playersWithPhotos = players.filter(p => p.photo).length;
        const playersWithTeamLogos = players.filter(p => p.logo).length;  // ✅ FIX: utilise 'logo'
        
        const scrapedData = {
            metadata: {
                source: 'ESPN API',
                timestamp: new Date().toISOString(),
                season: '2024-25',
                totalPlayers: players.length,
                sortBy: 'Points Per Game (Descending)',
                imageStats: {
                    playersWithPhotos: playersWithPhotos,
                    playersWithTeamLogos: playersWithTeamLogos,
                    photoPercentage: Math.round((playersWithPhotos / players.length) * 100),
                    logoPercentage: Math.round((playersWithTeamLogos / players.length) * 100)
                },
                summary: {
                    averagePointsPerGame: Number(avgPoints.toFixed(1)),
                    playersWith25PlusPoints: players25Plus,
                    playersWith30PlusPoints: players30Plus,
                    topScorer: {
                        name: players[0]?.name,
                        points: players[0]?.offensive_points_per_game,
                        team: players[0]?.team,
                        photo: players[0]?.photo,
                        teamLogo: players[0]?.logo  // ✅ FIX: utilise 'logo'
                    }
                }
            },
            players: players
        };
        
        // Sauvegarder les données
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `nba_top50_scorers_${dateStr}.json`;
        const filepath = path.join(DATA_DIR, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(scrapedData, null, 2));
        console.log(`💾 Data saved to: ${filepath}`);
        
        // Créer/mettre à jour le fichier "latest"
        const latestFilepath = path.join(DATA_DIR, 'nba_top50_scorers_latest.json');
        fs.writeFileSync(latestFilepath, JSON.stringify(scrapedData, null, 2));
        console.log(`🔄 Latest file updated: ${latestFilepath}`);
        
        // Afficher les stats principales
        console.log('\n📊 SCRAPING SUMMARY:');
        console.log(`📈 Total players scraped: ${players.length}`);
        console.log(`🏆 Top scorer: ${players[0]?.name} - ${players[0]?.offensive_points_per_game?.toFixed(1)} PPG (${players[0]?.team})`);
        console.log(`📊 Average PPG (Top 50): ${avgPoints.toFixed(1)}`);
        console.log(`🔥 Players with 25+ PPG: ${players25Plus}`);
        console.log(`🚀 Players with 30+ PPG: ${players30Plus}`);
        
        // 📸 Nouvelles stats sur les images (CORRIGÉ)
        console.log(`\n📸 IMAGE STATS:`);
        console.log(`📷 Players with photos: ${playersWithPhotos}/${players.length} (${Math.round((playersWithPhotos / players.length) * 100)}%)`);
        console.log(`🏆 Players with team logos: ${playersWithTeamLogos}/${players.length} (${Math.round((playersWithTeamLogos / players.length) * 100)}%)`);
        
        // Lister quelques exemples d'URLs pour vérification
        console.log(`\n🔗 SAMPLE URLS:`);
        const samplePlayer = players.find(p => p.photo && p.logo);  // ✅ FIX: utilise 'logo'
        if (samplePlayer) {
            console.log(`📸 Sample photo: ${samplePlayer.photo}`);
            console.log(`🏆 Sample logo: ${samplePlayer.logo}`);  // ✅ FIX: utilise 'logo'
        }
        
        return scrapedData;
        
    } catch (error) {
        console.error('❌ Error scraping NBA data:', error);
        throw error;
    }
}

// Scraper d'autres catégories (VERSION CORRIGÉE)
async function scrapeOtherStats() {
    console.log('\n📊 Scraping additional stats...');
    
    try {
        // Top rebounders
        const reboundData = await fetchESPNData('general.avgRebounds:desc', 20, CURRENT_SEASON);
        const rebounders = reboundData.athletes.map(playerData => parsePlayerData(playerData, reboundData.categories || []));
        
        // Top assists
        const assistData = await fetchESPNData('offensive.avgAssists:desc', 20, CURRENT_SEASON);
        const assistLeaders = assistData.athletes.map(playerData => parsePlayerData(playerData, assistData.categories || []));
        
        // 📸 Stats sur les images pour les stats additionnelles
        const reboundersWithPhotos = rebounders.filter(p => p.photo).length;
        const assistsWithPhotos = assistLeaders.filter(p => p.photo).length;
        
        // Sauvegarder les stats additionnelles
        const additionalStats = {
            metadata: {
                source: 'ESPN API',
                timestamp: new Date().toISOString(),
                season: '2024-25',
                imageStats: {
                    reboundersWithPhotos: reboundersWithPhotos,
                    assistLeadersWithPhotos: assistsWithPhotos
                }
            },
            topRebounders: rebounders,
            topAssistLeaders: assistLeaders
        };
        
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `nba_additional_stats_${dateStr}.json`;
        const filepath = path.join(DATA_DIR, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(additionalStats, null, 2));
        console.log(`💾 Additional stats saved to: ${filepath}`);
        
        console.log(`🏀 Top rebounder: ${rebounders[0]?.name} - ${rebounders[0]?.general_rebounds_per_game?.toFixed(1)} RPG`);
        console.log(`🎯 Top assist leader: ${assistLeaders[0]?.name} - ${assistLeaders[0]?.offensive_assists_per_game?.toFixed(1)} APG`);
        console.log(`📸 Rebounders with photos: ${reboundersWithPhotos}/${rebounders.length}`);
        console.log(`📸 Assist leaders with photos: ${assistsWithPhotos}/${assistLeaders.length}`);
        
        return additionalStats;
        
    } catch (error) {
        console.error('❌ Error scraping additional stats:', error);
        // Ne pas faire échouer le script principal si les stats additionnelles échouent
        return null;
    }
}

// Script principal
async function main() {
    console.log('🚀 Starting NBA Daily Stats Scraper (Enhanced with Images)');
    console.log(`📅 Date: ${new Date().toISOString()}`);
    console.log(`🏀 Season: ${CURRENT_SEASON}-${parseInt(CURRENT_SEASON) + 1}`);
    
    try {
        // Scraper les top 50 scorers (principal)
        const scorersData = await scrapeTop50Scorers();
        
        // Scraper les stats additionnelles (optionnel)
        await scrapeOtherStats();
        
        console.log('\n✅ NBA Stats scraping completed successfully!');
        console.log(`📁 Data saved in: ${DATA_DIR}/`);
        
        // Lister les fichiers créés
        const files = fs.readdirSync(DATA_DIR);
        console.log('📋 Files created:');
        files.forEach(file => {
            const filePath = path.join(DATA_DIR, file);
            const stats = fs.statSync(filePath);
            const sizeKB = Math.round(stats.size / 1024);
            console.log(`  - ${file} (${sizeKB} KB)`);
        });
        
    } catch (error) {
        console.error('\n❌ Scraping failed:', error);
        process.exit(1);
    }
}

// Lancer le script si exécuté directement
if (require.main === module) {
    main();
}

module.exports = {
    scrapeTop50Scorers,
    scrapeOtherStats,
    fetchESPNData,
    parsePlayerData,
    validateImageUrl
};
