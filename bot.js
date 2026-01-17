const { ReadableStream } = require('web-streams-polyfill');
global.ReadableStream = ReadableStream;

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ApplicationCommandOptionType } = require('discord.js');
const config = require('./config.json');
const fs = require('fs');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

let redirectChannelId = config.defaultAuctionChannelId || null;
let redirectTradeChannelId = config.defaultTradeChannelId || null;
let redirectInventoryChannelId = null;

const auctions = new Map(); // channelId -> { host, title, description, model, time, startingPrice, bids: [{user, diamonds, items}], timer, started, channelId, messageId, updateInterval }
const trades = new Map(); // messageId -> { host, hostDiamonds, hostItems, offers: [{user, diamonds, items, timestamp}], channelId, messageId, accepted: false, acceptedUser: null }
const inventories = new Map(); // userId -> { messageId, channelId, items, diamonds, lookingFor, robloxUsername, lastEdited }
const userTradeCount = new Map(); // userId -> count of active trades
const userGiveawayCount = new Map(); // userId -> count of active giveaways
const giveaways = new Map(); // messageId -> { host, items: [{name, quantity}], channelId, messageId, entries: [{user, items}], duration, expiresAt }

// Item categories for trades
const itemCategories = {
  huges: {
    'Black Hole Huges': ['HugeBlackHoleAngelus', 'HugeGoldenBlackHoleAngelus', 'HugeRainbowBlackHoleAngelus'],
    'Snow Globe Huges': ['HugeSnowGlobeHamster', 'HugeGoldenSnowGlobeHamster', 'HugeRainbowSnowGlobeHamster', 'HugeSnowGlobeCat', 'HugeGoldenSnowGlobeCat', 'HugeRainbowSnowGlobeCat'],
    'Ice Cube Huges': ['HugeIceCubeGingerbreadCorgi', 'HugeGoldenIceCubeGingerbreadCorgi', 'HugeRainbowIceCubeGingerbreadCorgi', 'HugeIceCubeCookieCutCat', 'HugeGoldenIceCubeCookieCutCat', 'HugeRainbowIceCubeCookieCutCat'],
    'Jelly Huges': ['HugeJellyDragon', 'HugeGoldenJellyDragon', 'HugeRainbowJellyDragon', 'HugeJellyKitsune', 'HugeGoldenJellyKitsune', 'HugeRainbowJellyKitsune'],
    'Blazing Huges': ['HugeBlazingShark', 'HugeGoldenBlazingShark', 'HugeRainbowBlazingShark', 'HugeBlazingBat', 'HugeGoldenBlazingBat', 'HugeRainbowBlazingBat'],
    'Event Huges': ['HugePartyCat', 'HugeGoldenPartyCat', 'HugeRainbowPartyCat', 'HugePartyDragon', 'HugeGoldenPartyDragon', 'HugeRainbowPartyDragon', 'HugeHellRock', 'HugeGoldenHellRock', 'HugeRainbowHellRock', 'HugeNinjaCat', 'HugeGoldenNinjaCat', 'HugeRainbowNinjaCat'],
    'Christmas.1 Huges': ['HugePresentChestMimic', 'HugeGoldenPresentChestMimic', 'HugeRainbowPresentChestMimic', 'HugeGingerbreadAngelus', 'HugeGoldenGingerbreadAngelus', 'HugeRainbowGingerbreadAngelus', 'HugeNorthPoleWolf', 'HugeGoldenNorthPoleWolf', 'HugeRainbowNorthPoleWolf'],
    'Christmas.2 Huges': ['HugeIcyPhoenix', 'HugeGoldenIcyPhoenix', 'HugeRainbowIcyPhoenix'],
    'Map Huges': ['HugeChestMimic', 'HugeGoldenChestMimic', 'HugeRainbowChestMimic', 'HugeSorcererCat', 'HugeGoldenSorcererCat', 'HugeRainbowSorcererCat', 'HugePropellerCat', 'HugeGoldenPropellerCat', 'HugeRainbowPropellerCat', 'HugeDominusAzureus', 'HugeGoldenDominusAzureus', 'HugeRainbowDominusAzureus', 'HugePropellerDog', 'HugeGoldenPropellerDog', 'HugeRainbowPropellerDog']
  },
  exclusives: ['BlazingShark', 'BlazingGoldenShark', 'BlazingRainbowShark', 'BlazingBat', 'BlazingGoldenBat', 'BlazingRainbowBat', 'BlazingCorgi', 'BlazingGoldenCorgi', 'BlazingRainbowCorgi', 'IceCubeGingerbreadCat', 'IceCubeGoldenGingerbreadCat', 'IceCubeRainbowGingerbreadCat', 'IceCubeGingerbreadCorgi', 'IceCubeGoldenGingerbreadCorgi', 'IceCubeRainbowGingerbreadCorgi', 'IceCubeCookieCuteCat', 'IceCubeGoldenCookieCuteCat', 'IceCubeRainbowCookieCuteCat', 'SnowGlobeCat', 'SnowGlobeGoldenCat', 'SnowGlobeRainbowCat', 'SnowGlobeAxolotl', 'SnowGlobeGoldenAxolotl', 'SnowGlobeRainbowAxolotl', 'SnowGlobeHamster', 'SnowGlobeGoldenHamster', 'SnowGlobeRainbowHamster', 'JellyCat', 'JellyGoldenCat', 'JellyRainbowCat', 'JellyBunny', 'JellyGoldenBunny', 'JellyRainbowBunny', 'JellyCorgi', 'JellyGoldenCorgi', 'JellyRainbowCorgi', 'BlackHoleAxolotl', 'BlackHoleGoldenAxolotl', 'BlackHoleRainbowAxolotl', 'BlackHoleImmortuus', 'BlackHoleGoldenImmortuus', 'BlackHoleRainbowImmortuus', 'BlackHoleKitsune', 'BlackHoleGoldenKitsune', 'BlackHoleRainbowKitsune'],
  eggs: ['HypeEgg', 'BlazingEgg', 'IceCubeEgg', 'SnowGlobeEgg', 'JellyEgg', 'BlackHoleEgg'],
  gifts: ['LikeGoalLootbox', '2026LootBox', 'SpintheWheellootbox']
};

// Giveaway item categories (for /setupgiveaway)
const giveawayItemCategories = {
  huges: {
    'Black Hole Huges': ['HugeBlackHoleAngelus', 'HugeGoldenBlackHoleAngelus', 'HugeRainbowBlackHoleAngelus'],
    'Snow Globe Huges': ['HugeSnowGlobeHamster', 'HugeGoldenSnowGlobeHamster', 'HugeRainbowSnowGlobeHamster', 'HugeSnowGlobeCat', 'HugeGoldenSnowGlobeCat', 'HugeRainbowSnowGlobeCat'],
    'Ice Cube Huges': ['HugeIceCubeGingerbreadCorgi', 'HugeGoldenIceCubeGingerbreadCorgi', 'HugeRainbowIceCubeGingerbreadCorgi', 'HugeIceCubeCookieCutCat', 'HugeGoldenIceCubeCookieCutCat', 'HugeRainbowIceCubeCookieCutCat'],
    'Jelly Huges': ['HugeJellyDragon', 'HugeGoldenJellyDragon', 'HugeRainbowJellyDragon', 'HugeJellyKitsune', 'HugeGoldenJellyKitsune', 'HugeRainbowJellyKitsune'],
    'Blazing Huges': ['HugeBlazingShark', 'HugeGoldenBlazingShark', 'HugeRainbowBlazingShark', 'HugeBlazingBat', 'HugeGoldenBlazingBat', 'HugeRainbowBlazingBat'],
    'Event Huges': ['HugePartyCat', 'HugeGoldenPartyCat', 'HugeRainbowPartyCat', 'HugePartyDragon', 'HugeGoldenPartyDragon', 'HugeRainbowPartyDragon', 'HugeHellRock', 'HugeGoldenHellRock', 'HugeRainbowHellRock', 'HugeNinjaCat', 'HugeGoldenNinjaCat', 'HugeRainbowNinjaCat'],
    'Christmas.1 Huges': ['HugePresentChestMimic', 'HugeGoldenPresentChestMimic', 'HugeRainbowPresentChestMimic', 'HugeGingerbreadAngelus', 'HugeGoldenGingerbreadAngelus', 'HugeRainbowGingerbreadAngelus', 'HugeNorthPoleWolf', 'HugeGoldenNorthPoleWolf', 'HugeRainbowNorthPoleWolf'],
    'Christmas.2 Huges': ['HugeIcyPhoenix', 'HugeGoldenIcyPhoenix', 'HugeRainbowIcyPhoenix'],
    'Map Huges': ['HugeChestMimic', 'HugeGoldenChestMimic', 'HugeRainbowChestMimic', 'HugeSorcererCat', 'HugeGoldenSorcererCat', 'HugeRainbowSorcererCat', 'HugePropellerCat', 'HugeGoldenPropellerCat', 'HugeRainbowPropellerCat', 'HugeDominusAzureus', 'HugeGoldenDominusAzureus', 'HugeRainbowDominusAzureus', 'HugePropellerDog', 'HugeGoldenPropellerDog', 'HugeRainbowPropellerDog']
  },
  exclusives: ['BlazingShark', 'BlazingGoldenShark', 'BlazingRainbowShark', 'BlazingBat', 'BlazingGoldenBat', 'BlazingRainbowBat', 'BlazingCorgi', 'BlazingGoldenCorgi', 'BlazingRainbowCorgi', 'IceCubeGingerbreadCat', 'IceCubeGoldenGingerbreadCat', 'IceCubeRainbowGingerbreadCat', 'IceCubeGingerbreadCorgi', 'IceCubeGoldenGingerbreadCorgi', 'IceCubeRainbowGingerbreadCorgi', 'IceCubeCookieCuteCat', 'IceCubeGoldenCookieCuteCat', 'IceCubeRainbowCookieCuteCat', 'SnowGlobeCat', 'SnowGlobeGoldenCat', 'SnowGlobeRainbowCat', 'SnowGlobeAxolotl', 'SnowGlobeGoldenAxolotl', 'SnowGlobeRainbowAxolotl', 'SnowGlobeHamster', 'SnowGlobeGoldenHamster', 'SnowGlobeRainbowHamster', 'JellyCat', 'JellyGoldenCat', 'JellyRainbowCat', 'JellyBunny', 'JellyGoldenBunny', 'JellyRainbowBunny', 'JellyCorgi', 'JellyGoldenCorgi', 'JellyRainbowCorgi', 'BlackHoleAxolotl', 'BlackHoleGoldenAxolotl', 'BlackHoleRainbowAxolotl', 'BlackHoleImmortuus', 'BlackHoleGoldenImmortuus', 'BlackHoleRainbowImmortuus', 'BlackHoleKitsune', 'BlackHoleGoldenKitsune', 'BlackHoleRainbowKitsune'],
  eggs: ['HypeEgg', 'BlazingEgg', 'IceCubeEgg', 'SnowGlobeEgg', 'JellyEgg', 'BlackHoleEgg'],
  gifts: ['LikeGoalLootbox', '2026LootBox', 'SpintheWheellootbox']
};

// Item emojis mapping - customize with your server emojis
const itemEmojis = {
  'HugeBlackHoleAngelus': '<:HugeBlackHoleAngelus:1461512580970618881>',
  'HugeGoldenBlackHoleAngelus': '<:HugeGoldenBlackHoleAngelus:1461512580970618881>',
  'HugeRainbowBlackHoleAngelus': '<:HugeRainbowBlackHoleAngelus:1461512580970618881>',
  'HugeSnowGlobeHamster': '<:HugeSnowGlobeHamster:1461512580970618881>',
  'HugeGoldenSnowGlobeHamster': '<:HugeGoldenSnowGlobeHamster:1461512580970618881>',
  'HugeRainbowSnowGlobeHamster': '<:HugeRainbowSnowGlobeHamster:1461512580970618881>',
  'HugeSnowGlobeCat': '<:HugeSnowGlobeCat:1461512580970618881>',
  'HugeGoldenSnowGlobeCat': '<:HugeGoldenSnowGlobeCat:1461512580970618881>',
  'HugeRainbowSnowGlobeCat': '<:HugeRainbowSnowGlobeCat:1461512580970618881>',
  'HugeIceCubeGingerbreadCorgi': '<:HugeIceCubeGingerbreadCorgi:1461512580970618881>',
  'HugeGoldenIceCubeGingerbreadCorgi': '<:HugeGoldenIceCubeGingerbreadCorgi:1461512580970618881>',
  'HugeRainbowIceCubeGingerbreadCorgi': '<:HugeRainbowIceCubeGingerbreadCorgi:1461512580970618881>',
  'HugeIceCubeCookieCutCat': '<:HugeIceCubeCookieCutCat:1461512580970618881>',
  'HugeGoldenIceCubeCookieCutCat': '<:HugeGoldenIceCubeCookieCutCat:1461512580970618881>',
  'HugeRainbowIceCubeCookieCutCat': '<:HugeRainbowIceCubeCookieCutCat:1461512580970618881>',
  // Add more emojis as needed - format: 'ItemName': '<:ItemName:ID>'
};

// Helper functions
function getItemEmoji(itemName) {
  return itemEmojis[itemName] || '';
}

function formatItemName(itemName) {
  // Convert "HugeBlackHoleAngelus" to "Huge Black Hole Angelus"
  return itemName
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Insert space between lowercase and uppercase
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2') // Insert space between multiple capitals
    .trim();
}

function formatItemsText(items) {
  // Format items with emoji and name
  if (!items || items.length === 0) return 'None';
  
  return items.map(item => {
    if (typeof item === 'object') {
      const emoji = getItemEmoji(item.name);
      const formattedName = formatItemName(item.name);
      return `${emoji} **${formattedName}** (**x${item.quantity}**)`;
    } else {
      const emoji = getItemEmoji(item);
      const formattedName = formatItemName(item);
      return `${emoji} **${formattedName}**`;
    }
  }).join('\n');
}

// Save data every 5 minutes
setInterval(() => {
  saveData();
}, 5 * 60 * 1000);

function saveData() {
  const data = {
    redirectChannelId,
    redirectTradeChannelId,
    redirectInventoryChannelId,
    inventories: Array.from(inventories.entries())
  };
  
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

function loadData() {
  try {
    if (fs.existsSync('data.json')) {
      const data = JSON.parse(fs.readFileSync('data.json', 'utf-8'));
      
      if (data.redirectChannelId) redirectChannelId = data.redirectChannelId;
      if (data.redirectTradeChannelId) redirectTradeChannelId = data.redirectTradeChannelId;
      if (data.redirectInventoryChannelId) redirectInventoryChannelId = data.redirectInventoryChannelId;
      
      if (data.inventories) {
        data.inventories.forEach(([key, value]) => {
          inventories.set(key, value);
        });
      }
      
      console.log('Data loaded successfully');
    }
  } catch (e) {
    console.error('Error loading data:', e);
  }
}

client.once('ready', async () => {
  console.log('Auction Bot is ready!');
  loadData();

  // Register slash commands
  const commands = [
    {
      name: 'setupauction',
      description: 'Show auction setup information'
    },
    {
      name: 'update',
      description: 'Update auction, trade, and inventory embeds'
    },
    {
      name: 'bid',
      description: 'Place a bid'
    },
    {
      name: 'endauction',
      description: 'End the current auction (host only)'
    },
    {
      name: 'auctionstatus',
      description: 'View current auction status'
    },
    {
      name: 'deleteauction',
      description: 'Delete an auction (admin only)',
      options: [
        {
          name: 'messageid',
          type: ApplicationCommandOptionType.String,
          description: 'The message ID of the auction',
          required: true
        }
      ]
    },
    {
      name: 'endauctionadmin',
      description: 'End an auction timer (admin only)',
      options: [
        {
          name: 'messageid',
          type: ApplicationCommandOptionType.String,
          description: 'The message ID of the auction',
          required: true
        }
      ]
    },
    {
      name: 'redirectauctions',
      description: 'Redirect all future auctions to a specific channel (admin only)',
      options: [
        {
          name: 'channel',
          type: ApplicationCommandOptionType.Channel,
          description: 'The channel to redirect auctions to',
          required: true
        }
      ]
    },
    {
      name: 'setuptrade',
      description: 'Show trade setup information'
    },
    {
      name: 'redirecttrade',
      description: 'Redirect all future trades to a specific channel (admin only)',
      options: [
        {
          name: 'channel',
          type: ApplicationCommandOptionType.Channel,
          description: 'The channel to redirect trades to',
          required: true
        }
      ]
    },
    {
      name: 'deletetrade',
      description: 'Delete a trade by message ID (admin only)',
      options: [
        {
          name: 'messageid',
          type: ApplicationCommandOptionType.String,
          description: 'The message ID of the trade',
          required: true
        }
      ]
    },
    {
      name: 'accepttrade',
      description: 'Accept a trade by message ID (admin only)',
      options: [
        {
          name: 'messageid',
          type: ApplicationCommandOptionType.String,
          description: 'The message ID of the trade',
          required: true
        }
      ]
    },
    {
      name: 'setupinventory',
      description: 'Create or view your inventory'
    },
    {
      name: 'redirectinventory',
      description: 'Set the channel for inventories (admin only)',
      options: [
        {
          name: 'channel',
          type: ApplicationCommandOptionType.Channel,
          description: 'The channel for inventories',
          required: true
        }
      ]
    },
    {
      name: 'setupgiveaway',
      description: 'Show giveaway setup information (admin only)'
    },
    {
      name: 'botcmds',
      description: 'View all available bot commands'
    },
  ];

  await client.application.commands.set(commands);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Check if user is waiting to upload proof
  if (message.author.waitingForProof && message.attachments.size > 0) {
    const proofData = message.author.waitingForProof;
    const attachment = message.attachments.first();

    // Verify it's an image
    if (!attachment.contentType || !attachment.contentType.startsWith('image/')) {
      return message.reply('❌ Please upload an image file.');
    }

    const guild = message.guild;
    let proofChannel = null;
    let proofEmbed = null;

    if (proofData.type === 'trade') {
      const tradeProofChannelId = '1461849745566990487';
      proofChannel = guild.channels.cache.get(tradeProofChannelId);

      if (!proofChannel) {
        delete message.author.waitingForProof;
        return message.reply('❌ Trade proof channel not found.');
      }

      // Get trade info
      const trade = trades.get(proofData.tradeMessageId);
      if (!trade) {
        delete message.author.waitingForProof;
        return message.reply('❌ Trade no longer exists.');
      }

      // Create proof embed
      proofEmbed = new EmbedBuilder()
        .setTitle('🔄 Trade Proof')
        .setDescription(`**Trade ID:** ${proofData.tradeMessageId}\n**Host:** ${trade.host}\n**Guest:** ${trade.acceptedUser}\n\n**Note:** ${proofData.description || 'No description provided'}`)
        .setColor(0x0099ff)
        .setImage(attachment.url)
        .setFooter({ text: `Submitted by ${message.author.username}` })
        .setTimestamp();
    } else if (proofData.type === 'auction') {
      const auctionProofChannelId = '1461849894615646309';
      proofChannel = guild.channels.cache.get(auctionProofChannelId);

      if (!proofChannel) {
        delete message.author.waitingForProof;
        return message.reply('❌ Auction proof channel not found.');
      }

      // Create proof embed for auction
      proofEmbed = new EmbedBuilder()
        .setTitle('🎪 Auction Proof')
        .setDescription(`**Winner:** ${message.author}\n\n**Note:** ${proofData.description || 'No description provided'}`)
        .setColor(0x00ff00)
        .setImage(attachment.url)
        .setFooter({ text: `Submitted by ${message.author.username}` })
        .setTimestamp();
    } else {
      delete message.author.waitingForProof;
      return message.reply('❌ Invalid proof type.');
    }

    // Send to proof channel
    await proofChannel.send({ embeds: [proofEmbed] });
    
    message.reply('✅ Proof image has been submitted and recorded!');
    delete message.author.waitingForProof;
    return;
  }

  const auction = Array.from(auctions.values()).find(a => a.channelId === message.channel.id);
  if (!auction) return;

  // Parse bid messages
  const bidRegex = /bid (\d+(?:,\d{3})*|\d+K?)(?:\s+and (.+))?/i;
  const match = message.content.match(bidRegex);
  if (match) {
    const diamondsStr = match[1];
    const items = match[2] || '';
    const diamonds = parseBid(diamondsStr);

    if (auction.model === 'items' && diamonds > 0) return message.reply('This auction is offers only.');
    if (auction.model === 'diamonds' && items) return message.reply('This auction is diamonds only.');

    // Add bid
    auction.bids.push({ user: message.author, diamonds, items });
    message.reply(`Bid placed: ${diamonds} 💎${items ? ` and ${items}` : ''}`);
  }
});

function parseBid(str) {
  str = str.replace(/,/g, '').toLowerCase();
  const multipliers = { 'k': 1000, 'm': 1000000, 'b': 1000000000, 't': 1000000000000 };
  for (const [suffix, multiplier] of Object.entries(multipliers)) {
    if (str.includes(suffix)) {
      const num = parseFloat(str.replace(suffix, ''));
      return Math.floor(num * multiplier);
    }
  }
  return parseInt(str);
}

function formatBid(num) {
  const suffixes = [
    { suffix: 'T', value: 1000000000000 },
    { suffix: 'B', value: 1000000000 },
    { suffix: 'M', value: 1000000 },
    { suffix: 'K', value: 1000 }
  ];

  for (const { suffix, value } of suffixes) {
    if (num >= value) {
      const formatted = (num / value).toFixed(1);
      // Remove trailing .0
      return formatted.endsWith('.0') ? formatted.slice(0, -2) + suffix : formatted + suffix;
    }
  }
  return num.toString();
}

client.on('interactionCreate', async (interaction) => {
  if (interaction.isCommand()) {
    const { commandName } = interaction;

    if (commandName === 'setupauction') {
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      if (!hasAdminRole) return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('Auction System Setup')
        .setDescription('Welcome to the live auction system!\n\n**How it works:**\n- Auctions are held per channel to avoid conflicts.\n- Bidding can be done via text (e.g., "bid 10000") or slash commands.\n- The auction ends automatically after the set time, or can be ended early.\n- Winner is the highest bidder (diamonds first, then first bid if tie).\n\nClick the button below to create a new auction.')
        .setColor(0x00ff00)
        .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
        .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('create_auction')
            .setLabel('Create Auction')
            .setStyle(ButtonStyle.Primary)
        );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'update') {
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      if (!hasAdminRole) return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });

      try {
        await interaction.deferReply({ ephemeral: true });

        const versionFile = require('./version.json');
        const currentVersion = versionFile.version || '1.0.9';

        // Define embeds to update
        const categoriesToUpdate = [
          {
            title: 'Auction System Setup',
            color: 0x00ff00,
            description: 'Welcome to the live auction system!\n\n**How it works:**\n- Auctions are held per channel to avoid conflicts.\n- Bidding can be done via text (e.g., "bid 10000") or slash commands.\n- The auction ends automatically after the set time, or can be ended early.\n- Winner is the highest bidder (diamonds first, then first bid if tie).\n\nClick the button below to create a new auction.',
            customId: 'create_auction',
            buttonLabel: 'Create Auction'
          },
          {
            title: 'Trade System Setup',
            color: 0x0099ff,
            description: 'Welcome to the live trade system!\n\n**How it works:**\n- Create a trade offer with items or diamonds.\n- Other users can place their offers in response.\n- Host can accept or decline offers.\n- Once accepted, both users are notified.\n\nClick the button below to create a new trade.',
            customId: 'create_trade',
            buttonLabel: 'Create Trade'
          },
          {
            title: '📦 Inventory System Setup',
            color: 0x00a8ff,
            description: 'Welcome to the inventory system!\n\n**How it works:**\n- Create your personal inventory with items you have in stock.\n- Set your diamond amount and describe what you\'re looking for.\n- Optionally add your Roblox username to display your avatar.\n- Other users can see your inventory and make offers!\n- Update anytime - your previous items stay saved if you don\'t remove them.\n\nClick the button below to create or edit your inventory.',
            customId: 'create_inventory',
            buttonLabel: 'Create Inventory'
          }
        ];

        let updatedCount = 0;
        let failedCount = 0;

        for (const category of categoriesToUpdate) {
          try {
            // Search for messages with this embed title in all channels
            const channels = interaction.guild.channels.cache.filter(c => c.isTextBased());
            
            for (const [, channel] of channels) {
              try {
                const messages = await channel.messages.fetch({ limit: 100 });
                
                for (const [, message] of messages) {
                  if (message.embeds.length > 0) {
                    const embed = message.embeds[0];
                    if (embed.title === category.title) {
                      // Found the embed, update it
                      const newEmbed = new EmbedBuilder()
                        .setTitle(category.title)
                        .setDescription(category.description)
                        .setColor(category.color)
                        .setFooter({ text: `Version ${currentVersion} | Made By Atlas` })
                        .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

                      const row = new ActionRowBuilder()
                        .addComponents(
                          new ButtonBuilder()
                            .setCustomId(category.customId)
                            .setLabel(category.buttonLabel)
                            .setStyle(ButtonStyle.Primary)
                        );

                      await message.edit({ embeds: [newEmbed], components: [row] });
                      updatedCount++;
                      break; // Found and updated, move to next category
                    }
                  }
                }
              } catch (e) {
                // Continue to next channel
              }
            }
          } catch (e) {
            failedCount++;
            console.error(`Error updating ${category.title}:`, e);
          }
        }

        const updateEmbed = new EmbedBuilder()
          .setTitle('✅ Embeds Updated')
          .setDescription(`**Update Summary:**\n- ✅ Successfully updated: ${updatedCount} embed(s)\n- ❌ Failed: ${failedCount} embed(s)\n\n**Updated Version:** ${currentVersion}`)
          .setColor(0x00ff00)
          .setFooter({ text: `Version ${currentVersion} | Made By Atlas` });

        await interaction.editReply({ embeds: [updateEmbed] });
      } catch (error) {
        console.error('Error updating embeds:', error);
        await interaction.editReply({ content: 'An error occurred while updating the embeds.' });
      }
    }

    if (commandName === 'bid') {
      const auction = Array.from(auctions.values()).find(a => a.channelId === interaction.channel.id);
      if (!auction) return interaction.reply({ content: 'No auction running in this channel.', ephemeral: true });

      // Show modal
      const modal = new ModalBuilder()
        .setCustomId('bid_modal')
        .setTitle('Place Your Bid');

      const diamondsInput = new TextInputBuilder()
        .setCustomId('diamonds')
        .setLabel('Diamonds (💎)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('10000')
        .setRequired(auction.model !== 'items');

      const itemsInput = new TextInputBuilder()
        .setCustomId('items')
        .setLabel('Additional Items (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Describe items')
        .setRequired(auction.model === 'items');

      const row1 = new ActionRowBuilder().addComponents(diamondsInput);
      const row2 = new ActionRowBuilder().addComponents(itemsInput);

      modal.addComponents(row1, row2);

      await interaction.showModal(modal);
    }

    if (commandName === 'endauction') {
      const auction = Array.from(auctions.values()).find(a => a.channelId === interaction.channel.id);
      if (!auction) return interaction.reply({ content: 'No auction running.', ephemeral: true });
      if (auction.host.id !== interaction.user.id) return interaction.reply({ content: 'Only the host can end the auction.', ephemeral: true });

      clearTimeout(auction.timer);
      await endAuction(interaction.channel);
      interaction.reply('Auction ended by host.');
    }

    if (commandName === 'auctionstatus') {
      const auction = Array.from(auctions.values()).find(a => a.channelId === interaction.channel.id);
      if (!auction) return interaction.reply({ content: 'No auction running.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('Auction Status')
        .setDescription(`Title: ${auction.title}\nDescription: ${auction.description}\nModel: ${auction.model}\nStarting Price: ${formatBid(auction.startingPrice)} 💎\nTime Left: ${Math.max(0, auction.time - Math.floor((Date.now() - auction.started) / 1000))} seconds\nBids: ${auction.bids.length}`)
        .setColor(0x0000ff);

      interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
    const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));

    if (commandName === 'deleteauction') {
      if (!hasAdminRole) return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      const messageId = interaction.options.getString('messageid');
      const auction = Array.from(auctions.values()).find(a => a.messageId === messageId);
      if (!auction) return interaction.reply({ content: 'Auction not found.', ephemeral: true });

      clearTimeout(auction.timer);
      clearInterval(auction.updateInterval);
      
      try {
        const channel = interaction.guild.channels.cache.get(auction.channelId);
        const message = await channel.messages.fetch(messageId);
        await message.delete();
      } catch (e) {
        // ignore if message not found
      }
      auctions.delete(auction.channelId);
      interaction.reply({ content: `Auction "${auction.title}" (from ${auction.host}) deleted by admin.`, ephemeral: true });
    }

    if (commandName === 'endauctionadmin') {
      if (!hasAdminRole) return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      const messageId = interaction.options.getString('messageid');
      const auction = Array.from(auctions.values()).find(a => a.messageId === messageId);
      if (!auction) return interaction.reply({ content: 'Auction not found.', ephemeral: true });

      clearTimeout(auction.timer);
      clearInterval(auction.updateInterval);
      const channel = interaction.guild.channels.cache.get(auction.channelId);
      await endAuction(channel);
      interaction.reply({ content: `Auction "${auction.title}" (from ${auction.host}) ended by admin.`, ephemeral: true });
    }

    if (commandName === 'restartauction') {
      if (!hasAdminRole) return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      const messageId = interaction.options.getString('messageid');
      const auction = Array.from(auctions.values()).find(a => a.messageId === messageId);
      if (!auction) return interaction.reply({ content: 'Auction not found.', ephemeral: true });

      clearTimeout(auction.timer);
      clearInterval(auction.updateInterval);
      auction.started = new Date();
      auction.timer = setTimeout(async () => {
        clearInterval(auction.updateInterval);
        await endAuction(interaction.guild.channels.cache.get(auction.channelId));
      }, auction.time * 1000);
      // Restart update interval
      auction.updateInterval = setInterval(async () => {
        const remaining = Math.max(0, Math.ceil((auction.started.getTime() + auction.time * 1000 - Date.now()) / 1000));
        if (remaining <= 0) {
          clearInterval(auction.updateInterval);
          return;
        }
        const currentBid = auction.bids.length > 0 ? Math.max(...auction.bids.map(b => b.diamonds)) : auction.startingPrice;
        const updatedEmbed = new EmbedBuilder()
          .setTitle(auction.title)
          .setDescription(`${auction.description}\n\n**Looking For:** ${auction.model}\n**Starting Price:** ${formatBid(auction.startingPrice)} 💎\n**Current Bid:** ${formatBid(currentBid)} 💎\n**Time Remaining:** ${remaining}s\n**Hosted by:** ${auction.host}`)
          .setColor(0x00ff00)
          .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
          .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');
        try {
          const channel = interaction.guild.channels.cache.get(auction.channelId);
          const message = await channel.messages.fetch(auction.messageId);
          await message.edit({ embeds: [updatedEmbed], components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bid_button').setLabel('Bid').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('view_bids_button').setLabel('View Bids').setStyle(ButtonStyle.Secondary)
          )] });
        } catch (e) {
          // ignore
        }
      }, 1000);
      interaction.reply({ content: 'Auction restarted.', ephemeral: true });
    }

    if (commandName === 'redirectauctions') {
      if (!hasAdminRole) return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      const channel = interaction.options.getChannel('channel');
      if (channel.type !== 0) return interaction.reply({ content: 'Please select a text channel.', ephemeral: true });
      redirectChannelId = channel.id;
      interaction.reply({ content: `All future auctions will be redirected to ${channel}.`, ephemeral: true });
    }

    if (commandName === 'redirecttrade') {
      if (!hasAdminRole) return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      const channel = interaction.options.getChannel('channel');
      if (channel.type !== 0) return interaction.reply({ content: 'Please select a text channel.', ephemeral: true });
      redirectTradeChannelId = channel.id;
      interaction.reply({ content: `All future trades will be redirected to ${channel}.`, ephemeral: true });
    }

    if (commandName === 'redirectinventory') {
      if (!hasAdminRole) return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      const channel = interaction.options.getChannel('channel');
      if (channel.type !== 0) return interaction.reply({ content: 'Please select a text channel.', ephemeral: true });
      redirectInventoryChannelId = channel.id;
      interaction.reply({ content: `All inventories will be posted to ${channel}.`, ephemeral: true });
    }

    if (commandName === 'setuptrade') {
      // Check admin permission first
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      if (!hasAdminRole) return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });

      // Check trade limit
      const isAdmin = true; // Already checked admin above
      const userTradeLimit = isAdmin ? 10 : 2;
      const currentTradeCount = userTradeCount.get(interaction.user.id) || 0;

      if (currentTradeCount >= userTradeLimit) {
        return interaction.reply({ 
          content: `You have reached your trade creation limit (${userTradeLimit}). ${isAdmin ? 'As an admin, you can have up to 10 active trades.' : 'Regular users can have up to 2 active trades.'}`,
          ephemeral: true 
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('Trade System Setup')
        .setDescription('Welcome to the live trade system!\n\n**How it works:**\n- Create a trade offer with items or diamonds.\n- Other users can place their offers in response.\n- Host can accept or decline offers.\n- Once accepted, both users are notified.\n\nClick the button below to create a new trade.')
        .setColor(0x0099ff)
        .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
        .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('create_trade')
            .setLabel('Create Trade')
            .setStyle(ButtonStyle.Primary)
        );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'deletetrade') {
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      if (!hasAdminRole) return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });

      const messageId = interaction.options.getString('messageid');
      const trade = trades.get(messageId);
      if (!trade) return interaction.reply({ content: 'Trade not found.', ephemeral: true });

      // Decrement trade count for host
      const hostId = trade.host.id;
      const currentCount = userTradeCount.get(hostId) || 0;
      if (currentCount > 0) {
        userTradeCount.set(hostId, currentCount - 1);
      }

      // Delete the trade message
      try {
        const channel = interaction.guild.channels.cache.get(trade.channelId);
        const message = await channel.messages.fetch(messageId);
        await message.delete();
      } catch (e) {
        // ignore if message not found
      }

      trades.delete(messageId);
      interaction.reply({ content: `Trade from ${trade.host} has been deleted.`, ephemeral: true });
    }

    if (commandName === 'accepttrade') {
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      if (!hasAdminRole) return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });

      const messageId = interaction.options.getString('messageid');
      const trade = trades.get(messageId);
      if (!trade) return interaction.reply({ content: 'Trade not found.', ephemeral: true });

      if (trade.offers.length > 0) {
        return interaction.reply({ content: 'This trade has offers and cannot be cancelled this way.', ephemeral: true });
      }

      // Mark trade as cancelled
      trade.accepted = true;
      trade.acceptedUser = null;
      trade.adminCancelled = true;

      // Update embed
      await updateTradeEmbed(interaction.guild, trade, messageId);

      const channel = interaction.guild.channels.cache.get(trade.channelId);
      await channel.send(`❌ This trade has been cancelled by an admin.`);

      interaction.reply({ content: `Trade has been cancelled.`, ephemeral: true });
    }

    if (commandName === 'setupinventory') {
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      if (!hasAdminRole) return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('📦 Inventory System Setup')
        .setDescription('Welcome to the inventory system!\n\n**How it works:**\n- Create your personal inventory with items you have in stock.\n- Set your diamond amount and describe what you\'re looking for.\n- Optionally add your Roblox username to display your avatar.\n- Other users can see your inventory and make offers!\n- Update anytime - your previous items stay saved if you don\'t remove them.\n\nClick the button below to create or edit your inventory.')
        .setColor(0x00a8ff)
        .setFooter({ text: 'Version 1.0.8 | Made By Atlas' })
        .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('create_inventory')
            .setLabel('Create Inventory')
            .setStyle(ButtonStyle.Primary)
        );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'setupgiveaway') {
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      if (!hasAdminRole) return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('🎁 Giveaway System Setup')
        .setDescription('Welcome to the giveaway system!\n\n**How it works:**\n- Create a giveaway with items you want to give away.\n- Users can enter the giveaway by clicking the button.\n- Winners are selected randomly from all entries.\n- The role <@&1462168024151883836> will be mentioned when the giveaway starts!\n\nClick the button below to create a new giveaway.')
        .setColor(0xFF1493)
        .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
        .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('create_giveaway')
            .setLabel('Create Giveaway')
            .setStyle(ButtonStyle.Primary)
        );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'botcmds') {
      const pages = [
        {
          title: '🎪 Auction Commands',
          color: 0x00ff00,
          fields: [
            { name: '/setupauction', value: 'Show auction setup information and create new auction (admin only)', inline: false },
            { name: '/bid', value: 'Place a bid on the current auction', inline: false },
            { name: '/endauction', value: 'End the current auction (host only)', inline: false },
            { name: '/auctionstatus', value: 'View current auction status', inline: false },
            { name: '/deleteauction [messageid]', value: 'Delete an auction (admin only)', inline: false },
            { name: '/endauctionadmin [messageid]', value: 'End an auction timer (admin only)', inline: false },
            { name: '/redirectauctions [channel]', value: 'Redirect all future auctions to a specific channel (admin only)', inline: false }
          ]
        },
        {
          title: '🔄 Trade Commands',
          color: 0x0099ff,
          fields: [
            { name: '/setuptrade', value: 'Show trade setup information and create new trade (admin only)', inline: false },
            { name: '/redirecttrade [channel]', value: 'Redirect all future trades to a specific channel (admin only)', inline: false },
            { name: '/deletetrade [messageid]', value: 'Delete a trade by message ID (admin only)', inline: false },
            { name: '/accepttrade [messageid]', value: 'Accept a trade by message ID (admin only)', inline: false }
          ]
        },
        {
          title: '📦 Inventory & 🎁 Giveaway Commands',
          color: 0x00a8ff,
          fields: [
            { name: '/setupinventory', value: 'Create or view your inventory (admin only)', inline: false },
            { name: '/redirectinventory [channel]', value: 'Set the channel for inventories (admin only)', inline: false },
            { name: '/setupgiveaway', value: 'Show giveaway setup and create new giveaway (admin only)', inline: false }
          ]
        },
        {
          title: '⚙️ Utility Commands',
          color: 0xffa500,
          fields: [
            { name: '/update', value: 'Update auction, trade, and inventory embeds (admin only)', inline: false },
            { name: '/botcmds', value: 'View all available bot commands', inline: false }
          ]
        }
      ];

      let currentPage = 0;

      const createEmbed = (pageIndex) => {
        const page = pages[pageIndex];
        return new EmbedBuilder()
          .setTitle(page.title)
          .setColor(page.color)
          .setDescription(`Commands List (Page ${pageIndex + 1}/${pages.length})`)
          .addFields(page.fields)
          .setFooter({ text: `Page ${pageIndex + 1}/${pages.length} | Made By Atlas` })
          .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');
      };

      const createButtons = (pageIndex) => {
        const row = new ActionRowBuilder();
        
        if (pageIndex > 0) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`botcmds_prev_${pageIndex}`)
              .setLabel('← Previous')
              .setStyle(ButtonStyle.Primary)
          );
        }

        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`botcmds_page`)
            .setLabel(`${pageIndex + 1}/${pages.length}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );

        if (pageIndex < pages.length - 1) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`botcmds_next_${pageIndex}`)
              .setLabel('Next →')
              .setStyle(ButtonStyle.Primary)
          );
        }

        return row;
      };

      const embed = createEmbed(currentPage);
      const buttons = createButtons(currentPage);

      await interaction.reply({ embeds: [embed], components: [buttons] });
    }
  }

  if (interaction.isButton()) {
    // Handle botcmds pagination
    if (interaction.customId.startsWith('botcmds_')) {
      const pages = [
        {
          title: '🎪 Auction Commands',
          color: 0x00ff00,
          fields: [
            { name: '/setupauction', value: 'Show auction setup information and create new auction (admin only)', inline: false },
            { name: '/bid', value: 'Place a bid on the current auction', inline: false },
            { name: '/endauction', value: 'End the current auction (host only)', inline: false },
            { name: '/auctionstatus', value: 'View current auction status', inline: false },
            { name: '/deleteauction [messageid]', value: 'Delete an auction (admin only)', inline: false },
            { name: '/endauctionadmin [messageid]', value: 'End an auction timer (admin only)', inline: false },
            { name: '/redirectauctions [channel]', value: 'Redirect all future auctions to a specific channel (admin only)', inline: false }
          ]
        },
        {
          title: '🔄 Trade Commands',
          color: 0x0099ff,
          fields: [
            { name: '/setuptrade', value: 'Show trade setup information and create new trade (admin only)', inline: false },
            { name: '/redirecttrade [channel]', value: 'Redirect all future trades to a specific channel (admin only)', inline: false },
            { name: '/deletetrade [messageid]', value: 'Delete a trade by message ID (admin only)', inline: false },
            { name: '/accepttrade [messageid]', value: 'Accept a trade by message ID (admin only)', inline: false }
          ]
        },
        {
          title: '📦 Inventory & 🎁 Giveaway Commands',
          color: 0x00a8ff,
          fields: [
            { name: '/setupinventory', value: 'Create or view your inventory (admin only)', inline: false },
            { name: '/redirectinventory [channel]', value: 'Set the channel for inventories (admin only)', inline: false },
            { name: '/setupgiveaway', value: 'Show giveaway setup and create new giveaway (admin only)', inline: false }
          ]
        },
        {
          title: '⚙️ Utility Commands',
          color: 0xffa500,
          fields: [
            { name: '/update', value: 'Update auction, trade, and inventory embeds (admin only)', inline: false },
            { name: '/botcmds', value: 'View all available bot commands', inline: false }
          ]
        }
      ];

      let currentPage = 0;
      if (interaction.customId.includes('_prev_')) {
        currentPage = parseInt(interaction.customId.split('_prev_')[1]) - 1;
      } else if (interaction.customId.includes('_next_')) {
        currentPage = parseInt(interaction.customId.split('_next_')[1]) + 1;
      }

      const createEmbed = (pageIndex) => {
        const page = pages[pageIndex];
        return new EmbedBuilder()
          .setTitle(page.title)
          .setColor(page.color)
          .setDescription(`Commands List (Page ${pageIndex + 1}/${pages.length})`)
          .addFields(page.fields)
          .setFooter({ text: `Page ${pageIndex + 1}/${pages.length} | Made By Atlas` })
          .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');
      };

      const createButtons = (pageIndex) => {
        const row = new ActionRowBuilder();
        
        if (pageIndex > 0) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`botcmds_prev_${pageIndex}`)
              .setLabel('← Previous')
              .setStyle(ButtonStyle.Primary)
          );
        }

        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`botcmds_page`)
            .setLabel(`${pageIndex + 1}/${pages.length}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );

        if (pageIndex < pages.length - 1) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`botcmds_next_${pageIndex}`)
              .setLabel('Next →')
              .setStyle(ButtonStyle.Primary)
          );
        }

        return row;
      };

      const embed = createEmbed(currentPage);
      const buttons = createButtons(currentPage);

      await interaction.update({ embeds: [embed], components: [buttons] });
      return;
    }

    if (interaction.customId === 'bid_button') {
      const auction = Array.from(auctions.values()).find(a => a.channelId === interaction.channel.id);
      if (!auction) return interaction.reply({ content: 'No auction running.', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId('bid_modal')
        .setTitle('Place Your Bid');

      const diamondsInput = new TextInputBuilder()
        .setCustomId('diamonds')
        .setLabel('Diamonds (💎)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('10000')
        .setRequired(auction.model !== 'items');

      const itemsInput = new TextInputBuilder()
        .setCustomId('items')
        .setLabel('Additional Items (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Describe items')
        .setRequired(auction.model === 'items');

      const row1 = new ActionRowBuilder().addComponents(diamondsInput);
      const row2 = new ActionRowBuilder().addComponents(itemsInput);

      modal.addComponents(row1, row2);

      await interaction.showModal(modal);
    }

    if (interaction.customId === 'view_bids_button') {
      const auction = Array.from(auctions.values()).find(a => a.channelId === interaction.channel.id);
      if (!auction) return interaction.reply({ content: 'No auction running.', ephemeral: true });

      if (auction.bids.length === 0) return interaction.reply({ content: 'No bids yet.', ephemeral: true });

      // Sort bids by diamonds descending
      const sortedBids = auction.bids.sort((a, b) => b.diamonds - a.diamonds);

      const bidList = sortedBids.map(bid => {
        const secondsAgo = Math.floor((Date.now() - bid.timestamp) / 1000);
        let timeAgo;
        if (secondsAgo < 60) timeAgo = `${secondsAgo} seconds ago`;
        else if (secondsAgo < 3600) timeAgo = `${Math.floor(secondsAgo / 60)} minutes ago`;
        else timeAgo = `${Math.floor(secondsAgo / 3600)} hours ago`;
        return `${bid.user.username}: ${bid.diamonds} 💎 - ${timeAgo}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('Bid List')
        .setDescription(bidList)
        .setColor(0x00ff00)
        .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
        .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

      interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId.startsWith('giveaway_enter_')) {
      const messageId = interaction.message.id;
      const giveaway = giveaways.get(messageId);
      if (!giveaway) return interaction.reply({ content: 'Giveaway not found.', ephemeral: true });

      // Check if user already entered
      const alreadyEntered = giveaway.entries.some(entry => entry.user.id === interaction.user.id);
      if (alreadyEntered) {
        return interaction.reply({ content: 'You are already entered in this giveaway!', ephemeral: true });
      }

      // Add entry
      giveaway.entries.push({
        user: interaction.user,
        enteredAt: Date.now()
      });

      await interaction.reply({ content: `✅ You have entered the giveaway! Total entries: ${giveaway.entries.length}`, ephemeral: true });
    }

    if (interaction.customId.startsWith('giveaway_end_')) {
      const messageId = interaction.message.id;
      const giveaway = giveaways.get(messageId);
      if (!giveaway) return interaction.reply({ content: 'Giveaway not found.', ephemeral: true });

      if (giveaway.host.id !== interaction.user.id) {
        const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
        const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
        if (!hasAdminRole) return interaction.reply({ content: 'Only the host or admin can end the giveaway.', ephemeral: true });
      }

      if (giveaway.entries.length === 0) {
        giveaways.delete(messageId);
        // Decrement giveaway count for host
        const hostId = giveaway.host.id;
        userGiveawayCount.set(hostId, Math.max(0, (userGiveawayCount.get(hostId) || 1) - 1));
        return interaction.reply({ content: 'Giveaway ended with no entries.', ephemeral: true });
      }

      // Select random winner
      const randomIndex = Math.floor(Math.random() * giveaway.entries.length);
      const winner = giveaway.entries[randomIndex];

      // Create winner embed
      const embed = new EmbedBuilder()
        .setTitle('🎁 Giveaway Ended!')
        .setColor(0xFF1493)
        .setDescription(`**Winner:** ${winner.user}`)
        .setFooter({ text: 'Version 1.0.9 | Made By Atlas' });

      // List items
      let itemsText = 'None';
      if (giveaway.items.length > 0) {
        itemsText = giveaway.items.map(item => 
          typeof item === 'object' ? `${item.name} x${item.quantity}` : item
        ).join('\n');
      }

      embed.addFields({
        name: 'Giveaway Items',
        value: itemsText,
        inline: false
      });

      embed.addFields({
        name: 'Total Entries',
        value: giveaway.entries.length.toString(),
        inline: true
      });

      const channel = interaction.guild.channels.cache.get(giveaway.channelId);
      await channel.send({ embeds: [embed] });

      // Notify winner
      await channel.send(`🎉 Congratulations ${winner.user}! You won the giveaway!`);

      // Decrement giveaway count for host
      const hostId = giveaway.host.id;
      userGiveawayCount.set(hostId, Math.max(0, (userGiveawayCount.get(hostId) || 1) - 1));

      giveaways.delete(messageId);
      await interaction.reply({ content: 'Giveaway ended! Winner selected.', ephemeral: true });
    }

    if (interaction.customId === 'create_auction') {
      const modal = new ModalBuilder()
        .setCustomId('auction_modal')
        .setTitle('Create Auction');

      const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Auction Title')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const descInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const priceInput = new TextInputBuilder()
        .setCustomId('starting_price')
        .setLabel('Starting Price (💎)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const modelInput = new TextInputBuilder()
        .setCustomId('model')
        .setLabel('Model (diamonds/items/both)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(priceInput),
        new ActionRowBuilder().addComponents(modelInput)
      );

      await interaction.showModal(modal);
    }

    if (interaction.customId === 'create_trade') {
      // Check trade limit
      const specialRoleId = '1461534174589485197';
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      
      const hasSpecialRole = interaction.member.roles.cache.has(specialRoleId);
      const isAdmin = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      
      const userId = interaction.user.id;
      const currentTrades = userTradeCount.get(userId) || 0;
      const maxTrades = isAdmin ? Infinity : (hasSpecialRole ? 5 : 1);
      
      if (currentTrades >= maxTrades) {
        return interaction.reply({ 
          content: `You have reached the maximum number of simultaneous trades (${maxTrades}).`, 
          ephemeral: true 
        });
      }

      // Show category selection
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const categorySelect = new StringSelectMenuBuilder()
        .setCustomId('trade_category_select')
        .setPlaceholder('Select an item category')
        .addOptions([
          { label: 'Huges', value: 'huges', emoji: '🔥' },
          { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
          { label: 'Eggs', value: 'eggs', emoji: '🥚' },
          { label: 'Gifts', value: 'gifts', emoji: '🎁' },
          { label: 'Diamonds', value: 'diamonds', emoji: '💎' }
        ]);

      const row = new ActionRowBuilder().addComponents(categorySelect);
      await interaction.reply({ content: 'Select an item category to add to your trade offer:', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'create_inventory') {
      // Load previous inventory items if editing
      const previousInventory = inventories.get(interaction.user.id);
      if (previousInventory) {
        interaction.user.inventoryItems = previousInventory.items;
      }

      // Show category selection
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const categorySelect = new StringSelectMenuBuilder()
        .setCustomId('inventory_category_select')
        .setPlaceholder('Select an item category')
        .addOptions([
          { label: 'Huges', value: 'huges', emoji: '🔥' },
          { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
          { label: 'Eggs', value: 'eggs', emoji: '🥚' },
          { label: 'Gifts', value: 'gifts', emoji: '🎁' },
          { label: 'Diamonds', value: 'diamonds', emoji: '💎' }
        ]);

      const row = new ActionRowBuilder().addComponents(categorySelect);
      await interaction.reply({ content: 'Select an item category to add to your inventory:', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'create_giveaway') {
      // Check if user has the required role to create giveaway
      const giveawayCreatorRoleId = '1461798386201006324';
      const specialRoleId = '1461534174589485197';
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      
      const hasGiveawayRole = interaction.member.roles.cache.has(giveawayCreatorRoleId);
      const hasSpecialRole = interaction.member.roles.cache.has(specialRoleId);
      const isAdmin = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      
      if (!hasGiveawayRole && !hasSpecialRole && !isAdmin) {
        return interaction.reply({ content: 'You do not have permission to create a giveaway.', ephemeral: true });
      }

      // Check giveaway limit
      const userId = interaction.user.id;
      const currentGiveaways = userGiveawayCount.get(userId) || 0;
      const maxGiveaways = isAdmin ? Infinity : (hasSpecialRole ? 3 : 1);
      
      if (currentGiveaways >= maxGiveaways) {
        return interaction.reply({ 
          content: `You have reached the maximum number of simultaneous giveaways (${maxGiveaways}).`, 
          ephemeral: true 
        });
      }

      // Initialize giveaway items for this user
      interaction.user.giveawayItems = [];

      // Show category selection for giveaway
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const categorySelect = new StringSelectMenuBuilder()
        .setCustomId('giveaway_category_select')
        .setPlaceholder('Select an item category')
        .addOptions([
          { label: 'Huges', value: 'huges', emoji: '🔥' },
          { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
          { label: 'Eggs', value: 'eggs', emoji: '🥚' },
          { label: 'Gifts', value: 'gifts', emoji: '🎁' }
        ]);

      const row = new ActionRowBuilder().addComponents(categorySelect);
      await interaction.reply({ content: 'Select an item category to add to your giveaway:', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'trade_offer_button') {
      const trade = trades.get(interaction.message.id);
      if (!trade) return interaction.reply({ content: 'Trade not found.', flags: 64 });

      // Show category selection for offer
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const categorySelect = new StringSelectMenuBuilder()
        .setCustomId(`offer_category_select_${interaction.message.id}`)
        .setPlaceholder('Select an item category')
        .addOptions([
          { label: 'Huges', value: 'huges', emoji: '🔥' },
          { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
          { label: 'Eggs', value: 'eggs', emoji: '🥚' },
          { label: 'Gifts', value: 'gifts', emoji: '🎁' },
          { label: 'Diamonds', value: 'diamonds', emoji: '💎' }
        ]);

      const row = new ActionRowBuilder().addComponents(categorySelect);
      
      // Initialize offer items for this user
      interaction.user.offerTradeItems = [];
      interaction.user.offerMessageId = interaction.message.id;
      
      await interaction.reply({ content: 'Select an item category for your offer:', components: [row], flags: 64 });
    }

    if (interaction.customId.startsWith('trade_accept_')) {
      const messageId = interaction.customId.replace('trade_accept_', '');
      const trade = trades.get(messageId);
      if (!trade) return interaction.reply({ content: 'Trade not found.', ephemeral: true });
      if (trade.host.id !== interaction.user.id) return interaction.reply({ content: 'Only the host can accept offers.', ephemeral: true });

      // Accept the last offer
      const lastOffer = trade.offers[trade.offers.length - 1];
      trade.accepted = true;
      trade.acceptedUser = lastOffer.user;

      // Update embed and ping both users
      await updateTradeEmbed(interaction.guild, trade, messageId);
      const channel = interaction.guild.channels.cache.get(trade.channelId);
      await channel.send(`✅ Trade accepted! ${trade.host} and ${lastOffer.user}, your trade has been accepted.`);

      await interaction.reply({ content: 'Trade accepted!', ephemeral: true });
    }

    if (interaction.customId.startsWith('trade_decline_')) {
      const messageId = interaction.customId.replace('trade_decline_', '');
      const trade = trades.get(messageId);
      if (!trade) return interaction.reply({ content: 'Trade not found.', ephemeral: true });
      if (trade.host.id !== interaction.user.id) return interaction.reply({ content: 'Only the host can decline offers.', ephemeral: true });

      // Decline the last offer
      const lastOffer = trade.offers[trade.offers.length - 1];
      trade.offers.pop();

      // Update embed
      await updateTradeEmbed(interaction.guild, trade, messageId);
      const channel = interaction.guild.channels.cache.get(trade.channelId);
      await channel.send(`❌ Trade offer from ${lastOffer.user} has been declined.`);

      await interaction.reply({ content: 'Offer declined!', ephemeral: true });
    }

    if (interaction.customId.startsWith('trade_delete_')) {
      // Find which trade this delete button belongs to
      let tradeMessageId = null;
      let trade = null;

      for (const [messageId, t] of trades) {
        if (t.messageId === interaction.message.id) {
          tradeMessageId = messageId;
          trade = t;
          break;
        }
      }

      if (!trade) return interaction.reply({ content: 'Trade not found.', ephemeral: true });
      if (trade.host.id !== interaction.user.id) return interaction.reply({ content: 'Only the host can delete this trade.', ephemeral: true });

      // Delete the trade message
      try {
        await interaction.message.delete();
      } catch (e) {
        // ignore if message not found
      }

      // Decrement trade count for host
      const hostId = trade.host.id;
      const currentCount = userTradeCount.get(hostId) || 0;
      if (currentCount > 0) {
        userTradeCount.set(hostId, currentCount - 1);
      }

      trades.delete(tradeMessageId);
      await interaction.reply({ content: 'Trade deleted!', ephemeral: true });
    }

    if (interaction.customId.startsWith('upload_proof_trade_')) {
      const messageId = interaction.customId.replace('upload_proof_trade_', '');
      const trade = trades.get(messageId);
      if (!trade) return interaction.reply({ content: 'Trade not found.', ephemeral: true });

      // Check if user is host or accepted user
      if (trade.host.id !== interaction.user.id && trade.acceptedUser.id !== interaction.user.id) {
        return interaction.reply({ content: 'Only the host or guest can upload proof.', ephemeral: true });
      }

      // Show modal for image description
      const modal = new ModalBuilder()
        .setCustomId(`proof_image_modal_trade_${messageId}`)
        .setTitle('Upload Proof Image');

      const descriptionInput = new TextInputBuilder()
        .setCustomId('proof_description')
        .setLabel('Description (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Add any notes about this trade...')
        .setRequired(false);

      const row = new ActionRowBuilder().addComponents(descriptionInput);
      modal.addComponents(row);

      await interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('upload_proof_auction_')) {
      // Show modal for image description
      const modal = new ModalBuilder()
        .setCustomId('proof_image_modal_auction')
        .setTitle('Upload Proof Image');

      const descriptionInput = new TextInputBuilder()
        .setCustomId('proof_description')
        .setLabel('Description (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Add any notes about this auction...')
        .setRequired(false);

      const row = new ActionRowBuilder().addComponents(descriptionInput);
      modal.addComponents(row);

      await interaction.showModal(modal);
    }

    if (interaction.customId === 'inventory_update_button') {
      // Load previous inventory items
      const previousInventory = inventories.get(interaction.user.id);
      if (previousInventory) {
        interaction.user.inventoryItems = previousInventory.items;
      }

      // Show category selection for inventory update
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const categorySelect = new StringSelectMenuBuilder()
        .setCustomId('inventory_category_select')
        .setPlaceholder('Select an item category')
        .addOptions([
          { label: 'Huges', value: 'huges', emoji: '🔥' },
          { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
          { label: 'Eggs', value: 'eggs', emoji: '🥚' },
          { label: 'Gifts', value: 'gifts', emoji: '🎁' },
          { label: 'Diamonds', value: 'diamonds', emoji: '💎' }
        ]);

      const row = new ActionRowBuilder().addComponents(categorySelect);
      await interaction.reply({ content: 'Select an item category to add to your inventory:', components: [row], ephemeral: true });
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'trade_category_select') {
      const category = interaction.values[0];
      const { StringSelectMenuBuilder } = require('discord.js');
      
      let items = [];
      if (category === 'diamonds') {
        // Show modal for diamonds input
        const diamondsModal = new ModalBuilder()
          .setCustomId('trade_diamonds_modal')
          .setTitle('Add Diamonds');

        const diamondsInput = new TextInputBuilder()
          .setCustomId('diamonds_amount')
          .setLabel('Amount of Diamonds')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g., 5000, 10K, 1M')
          .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(diamondsInput);
        diamondsModal.addComponents(row1);

        await interaction.showModal(diamondsModal);
        return;
      } else if (category === 'huges') {
        // Para huges, mostrar subcategorias
        const subcategorySelect = new StringSelectMenuBuilder()
          .setCustomId('trade_huge_subcategory_select')
          .setPlaceholder('Select a Huge subcategory')
          .addOptions(Object.keys(itemCategories.huges).map(sub => ({
            label: sub,
            value: sub
          })));
        const row = new ActionRowBuilder().addComponents(subcategorySelect);
        await interaction.reply({ content: `Select a subcategory from **Huges**:`, components: [row], flags: 64 });
        return;
      } else {
        items = itemCategories[category];
      }
      
      // Para outras categorias
      const itemSelect = new StringSelectMenuBuilder()
        .setCustomId(`trade_item_select_${category}`)
        .setPlaceholder(`Select items from ${category}`)
        .setMaxValues(Math.min(items.length, 25))
        .addOptions(items.slice(0, 25).map(item => ({ 
          label: formatItemName(item), 
          value: item,
          emoji: getItemEmoji(item)
        })));

      const row = new ActionRowBuilder().addComponents(itemSelect);
      await interaction.reply({ content: `Select items from **${category}** category:`, components: [row], flags: 64 });
    }

    if (interaction.customId === 'trade_huge_subcategory_select') {
      const subcategory = interaction.values[0];
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const items = itemCategories.huges[subcategory];
      const itemSelect = new StringSelectMenuBuilder()
        .setCustomId(`trade_item_select_huges_${subcategory}`)
        .setPlaceholder(`Select items from ${subcategory}`)
        .setMaxValues(Math.min(items.length, 25))
        .addOptions(items.map(item => ({ 
          label: formatItemName(item), 
          value: item,
          emoji: getItemEmoji(item)
        })));

      const row = new ActionRowBuilder().addComponents(itemSelect);
      await interaction.reply({ content: `Select items from **${subcategory}**:`, components: [row], flags: 64 });
    }

    if (interaction.customId.startsWith('trade_item_select_')) {
      const parts = interaction.customId.replace('trade_item_select_', '').split('_');
      let category = parts[0];
      let subcategory = parts.length > 1 ? parts.slice(1).join('_') : null;
      
      const selectedItems = interaction.values;

      // Store items selection for quantity input
      interaction.user.selectedTradeItems = selectedItems;
      interaction.user.selectedTradeCategory = category;
      interaction.user.selectedTradeSubcategory = subcategory;

      // Show quantity selection modal
      const quantityModal = new ModalBuilder()
        .setCustomId(`trade_item_quantities_modal`)
        .setTitle('Select Quantities');

      let inputs = [];
      selectedItems.slice(0, 5).forEach((item, index) => {
        const input = new TextInputBuilder()
          .setCustomId(`qty_${index}`)
          .setLabel(`${item} quantity`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('1')
          .setRequired(true)
          .setMaxLength(3);
        inputs.push(new ActionRowBuilder().addComponents(input));
      });

      quantityModal.addComponents(inputs);
      await interaction.showModal(quantityModal);
    }

    if (interaction.customId.startsWith('offer_category_select_')) {
      const messageId = interaction.customId.replace('offer_category_select_', '');
      const category = interaction.values[0];
      const { StringSelectMenuBuilder } = require('discord.js');
      
      if (category === 'diamonds') {
        const diamondsModal = new ModalBuilder()
          .setCustomId(`offer_diamonds_modal_${messageId}`)
          .setTitle('Add Diamonds to Offer');

        const diamondsInput = new TextInputBuilder()
          .setCustomId('offer_diamonds_amount')
          .setLabel('Amount of Diamonds')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g., 5000, 10K, 1M')
          .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(diamondsInput);
        diamondsModal.addComponents(row1);

        await interaction.showModal(diamondsModal);
        return;
      } else if (category === 'huges') {
        // Para huges, mostrar subcategorias
        const subcategorySelect = new StringSelectMenuBuilder()
          .setCustomId(`offer_huge_subcategory_select_${messageId}`)
          .setPlaceholder('Select a Huge subcategory')
          .addOptions(Object.keys(itemCategories.huges).map(sub => ({
            label: sub,
            value: sub
          })));
        const row = new ActionRowBuilder().addComponents(subcategorySelect);
        await interaction.reply({ content: `Select a subcategory from **Huges**:`, components: [row], flags: 64 });
        return;
      }
      
      const items = itemCategories[category];
      const itemSelect = new StringSelectMenuBuilder()
        .setCustomId(`offer_item_select_${messageId}_${category}`)
        .setPlaceholder(`Select items from ${category}`)
        .setMaxValues(Math.min(items.length, 25))
        .addOptions(items.slice(0, 25).map(item => ({ label: item, value: item })));

      const row = new ActionRowBuilder().addComponents(itemSelect);
      await interaction.reply({ content: `Select items from **${category}** category:`, components: [row], flags: 64 });
    }

    if (interaction.customId.startsWith('offer_huge_subcategory_select_')) {
      const messageId = interaction.customId.replace('offer_huge_subcategory_select_', '');
      const subcategory = interaction.values[0];
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const items = itemCategories.huges[subcategory];
      const itemSelect = new StringSelectMenuBuilder()
        .setCustomId(`offer_item_select_${messageId}_huges_${subcategory}`)
        .setPlaceholder(`Select items from ${subcategory}`)
        .setMaxValues(Math.min(items.length, 25))
        .addOptions(items.map(item => ({ label: item, value: item })));

      const row = new ActionRowBuilder().addComponents(itemSelect);
      await interaction.reply({ content: `Select items from **${subcategory}**:`, components: [row], flags: 64 });
    }

    if (interaction.customId.startsWith('offer_item_select_')) {
      const parts = interaction.customId.replace('offer_item_select_', '').split('_');
      const messageId = parts[0];
      let category = parts[1];
      let subcategory = parts.length > 2 ? parts.slice(2).join('_') : null;
      const selectedItems = interaction.values;

      // Store items selection for quantity input
      interaction.user.selectedOfferItems = selectedItems;
      interaction.user.selectedOfferCategory = category;
      interaction.user.selectedOfferSubcategory = subcategory;
      interaction.user.selectedOfferMessageId = messageId;

      // Show quantity selection modal
      const quantityModal = new ModalBuilder()
        .setCustomId(`offer_item_quantities_modal_${messageId}`)
        .setTitle('Select Quantities');

      let inputs = [];
      selectedItems.slice(0, 5).forEach((item, index) => {
        const input = new TextInputBuilder()
          .setCustomId(`offer_qty_${index}`)
          .setLabel(`${item} quantity`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('1')
          .setRequired(true)
          .setMaxLength(3);
        inputs.push(new ActionRowBuilder().addComponents(input));
      });

      quantityModal.addComponents(inputs);
      await interaction.showModal(quantityModal);
    }

    if (interaction.customId === 'trade_continue_select') {
      const choice = interaction.values[0];

      if (choice === 'add_category') {
        const { StringSelectMenuBuilder } = require('discord.js');
        
        const categorySelect = new StringSelectMenuBuilder()
          .setCustomId('trade_category_select')
          .setPlaceholder('Select another item category')
          .addOptions([
            { label: 'Huges', value: 'huges', emoji: '🔥' },
            { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
            { label: 'Eggs', value: 'eggs', emoji: '🥚' },
            { label: 'Gifts', value: 'gifts', emoji: '🎁' },
            { label: 'Diamonds', value: 'diamonds', emoji: '💎' }
          ]);

        const row = new ActionRowBuilder().addComponents(categorySelect);
        await interaction.reply({ content: 'Select another item category:', components: [row], flags: 64 });
      } else if (choice === 'remove_items') {
        // Show a modal to remove items
        const itemsList = interaction.user.tradeItems || [];
        const { StringSelectMenuBuilder } = require('discord.js');
        
        const itemSelect = new StringSelectMenuBuilder()
          .setCustomId('trade_remove_item_select')
          .setPlaceholder('Select items to remove')
          .setMaxValues(Math.min(itemsList.length, 25))
          .addOptions(itemsList.map((item, idx) => ({ 
            label: `${item.name} (x${item.quantity})`, 
            value: idx.toString()
          })));

        const row = new ActionRowBuilder().addComponents(itemSelect);
        await interaction.reply({ content: 'Select items to remove:', components: [row], flags: 64 });
      } else if (choice === 'confirm_items') {
        // Move to diamonds and target user
        const diamondsModal = new ModalBuilder()
          .setCustomId('trade_setup_modal')
          .setTitle('Complete Your Trade Offer');

        const diamondsInput = new TextInputBuilder()
          .setCustomId('trade_diamonds')
          .setLabel('Diamonds (optional)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('0')
          .setRequired(false);

        const userInput = new TextInputBuilder()
          .setCustomId('trade_target_user')
          .setLabel('Target User (optional)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Leave empty for open trade')
          .setRequired(false);

        const row1 = new ActionRowBuilder().addComponents(diamondsInput);
        const row2 = new ActionRowBuilder().addComponents(userInput);

        diamondsModal.addComponents(row1, row2);
        await interaction.showModal(diamondsModal);
      }
    }

    if (interaction.customId.startsWith('offer_continue_select_')) {
      const messageId = interaction.customId.replace('offer_continue_select_', '');
      const choice = interaction.values[0];

      if (choice === 'add_category') {
        const { StringSelectMenuBuilder } = require('discord.js');
        
        const categorySelect = new StringSelectMenuBuilder()
          .setCustomId(`offer_category_select_${messageId}`)
          .setPlaceholder('Select another item category')
          .addOptions([
            { label: 'Huges', value: 'huges', emoji: '🔥' },
            { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
            { label: 'Eggs', value: 'eggs', emoji: '🥚' },
            { label: 'Gifts', value: 'gifts', emoji: '🎁' },
            { label: 'Diamonds', value: 'diamonds', emoji: '💎' }
          ]);

        const row = new ActionRowBuilder().addComponents(categorySelect);
        await interaction.reply({ content: 'Select another item category:', components: [row], flags: 64 });
      } else if (choice === 'confirm_items') {
        // Move to diamonds and submit
        const diamondsModal = new ModalBuilder()
          .setCustomId(`offer_submit_modal_${messageId}`)
          .setTitle('Complete Your Offer');

        const diamondsInput = new TextInputBuilder()
          .setCustomId('offer_diamonds')
          .setLabel('Diamonds (optional)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('0')
          .setRequired(false);

        const row1 = new ActionRowBuilder().addComponents(diamondsInput);
        diamondsModal.addComponents(row1);
        
        // Store items in interaction metadata
        interaction.user.offerItems = interaction.user.offerTradeItems || [];
        interaction.user.messageId = messageId;
        delete interaction.user.offerTradeItems;
        delete interaction.user.selectedOfferItems;
        delete interaction.user.selectedOfferCategory;
        delete interaction.user.selectedOfferSubcategory;
        delete interaction.user.selectedOfferMessageId;

        await interaction.showModal(diamondsModal);
      } else if (choice === 'remove_items') {
        // Show items to remove
        const items = interaction.user.offerTradeItems || [];
        if (items.length === 0) {
          return await interaction.reply({ content: 'No items to remove.', flags: 64 });
        }

        const { StringSelectMenuBuilder } = require('discord.js');
        
        const removeSelect = new StringSelectMenuBuilder()
          .setCustomId(`offer_remove_item_select_${messageId}`)
          .setPlaceholder('Select items to remove')
          .setMinValues(1)
          .setMaxValues(Math.min(25, items.length));

        items.forEach((item, index) => {
          const emoji = getItemEmoji(item.name);
          removeSelect.addOptions({
            label: `${formatItemName(item.name)} (x${item.quantity})`,
            value: `${index}`,
            emoji: emoji || '📦'
          });
        });

        const row = new ActionRowBuilder().addComponents(removeSelect);
        await interaction.reply({ content: 'Select items to remove:', components: [row], flags: 64 });
      }
    }

    if (interaction.customId.startsWith('offer_remove_item_select_')) {
      const messageId = interaction.customId.replace('offer_remove_item_select_', '');
      const indices = interaction.values.map(v => parseInt(v)).sort((a, b) => b - a);
      const items = interaction.user.offerTradeItems || [];

      // Remove items in reverse order to maintain correct indices
      indices.forEach(index => {
        if (index >= 0 && index < items.length) {
          items.splice(index, 1);
        }
      });

      if (items.length === 0) {
        await interaction.reply({ content: 'All items removed. Please add items again.', flags: 64 });
        delete interaction.user.offerTradeItems;
      } else {
        // Redisplay the continue select
        const { StringSelectMenuBuilder } = require('discord.js');
        
        const continueSelect = new StringSelectMenuBuilder()
          .setCustomId(`offer_continue_select_${messageId}`)
          .setPlaceholder('What would you like to do?')
          .addOptions([
            { label: '✅ Confirm and Proceed', value: 'confirm_items' },
            { label: '➕ Add Another Category', value: 'add_category' },
            { label: '❌ Remove Items', value: 'remove_items' }
          ]);

        const row = new ActionRowBuilder().addComponents(continueSelect);
        
        let itemsList = '';
        items.forEach(item => {
          itemsList += `${item.name} x${item.quantity}\n`;
        });

        await interaction.reply({ 
          content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
          components: [row], 
          flags: 64 
        });
      }
    }

    if (interaction.customId === 'inventory_continue_select') {
      const choice = interaction.values[0];

      if (choice === 'add_category') {
        const { StringSelectMenuBuilder } = require('discord.js');
        
        const categorySelect = new StringSelectMenuBuilder()
          .setCustomId('inventory_category_select')
          .setPlaceholder('Select another item category')
          .addOptions([
            { label: 'Huges', value: 'huges', emoji: '🔥' },
            { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
            { label: 'Eggs', value: 'eggs', emoji: '🥚' },
            { label: 'Gifts', value: 'gifts', emoji: '🎁' },
            { label: 'Diamonds', value: 'diamonds', emoji: '💎' }
          ]);

        const row = new ActionRowBuilder().addComponents(categorySelect);
        await interaction.reply({ content: 'Select another item category:', components: [row], flags: 64 });
      } else if (choice === 'continue_to_setup') {
        // Move to inventory setup modal
        const inventoryModal = new ModalBuilder()
          .setCustomId('inventory_setup_modal')
          .setTitle('Complete Your Inventory');

        const diamondsInput = new TextInputBuilder()
          .setCustomId('inv_diamonds')
          .setLabel('Diamonds in stock (optional)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('0')
          .setRequired(false);

        const lookingForInput = new TextInputBuilder()
          .setCustomId('inv_looking_for')
          .setLabel('What are you looking for?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Describe what items/diamonds you\'re looking for')
          .setRequired(true);

        const robloxInput = new TextInputBuilder()
          .setCustomId('inv_roblox_username')
          .setLabel('Roblox username (optional)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('YourRobloxUsername')
          .setRequired(false);

        const row1 = new ActionRowBuilder().addComponents(diamondsInput);
        const row2 = new ActionRowBuilder().addComponents(lookingForInput);
        const row3 = new ActionRowBuilder().addComponents(robloxInput);

        inventoryModal.addComponents(row1, row2, row3);
        
        delete interaction.user.selectedInventoryItems;
        delete interaction.user.selectedInventoryCategory;
        delete interaction.user.selectedInventorySubcategory;

        await interaction.showModal(inventoryModal);
      } else if (choice === 'remove_items') {
        // Show items to remove
        const items = interaction.user.inventoryItems || [];
        if (items.length === 0) {
          return await interaction.reply({ content: 'No items to remove.', flags: 64 });
        }

        const { StringSelectMenuBuilder } = require('discord.js');
        
        const removeSelect = new StringSelectMenuBuilder()
          .setCustomId('inventory_remove_item_select')
          .setPlaceholder('Select items to remove')
          .setMinValues(1)
          .setMaxValues(Math.min(25, items.length));

        items.forEach((item, index) => {
          const emoji = getItemEmoji(item.name);
          removeSelect.addOptions({
            label: `${formatItemName(item.name)} (x${item.quantity})`,
            value: `${index}`,
            emoji: emoji || '📦'
          });
        });

        const row = new ActionRowBuilder().addComponents(removeSelect);
        await interaction.reply({ content: 'Select items to remove:', components: [row], flags: 64 });
      }
    }

    if (interaction.customId === 'inventory_remove_item_select') {
      const indices = interaction.values.map(v => parseInt(v)).sort((a, b) => b - a);
      const items = interaction.user.inventoryItems || [];

      // Remove items in reverse order to maintain correct indices
      indices.forEach(index => {
        if (index >= 0 && index < items.length) {
          items.splice(index, 1);
        }
      });

      if (items.length === 0) {
        await interaction.reply({ content: 'All items removed. Please add items again.', flags: 64 });
        delete interaction.user.inventoryItems;
      } else {
        // Redisplay the continue select
        const { StringSelectMenuBuilder } = require('discord.js');
        
        const continueSelect = new StringSelectMenuBuilder()
          .setCustomId(`inventory_continue_select`)
          .setPlaceholder('What would you like to do?')
          .addOptions([
            { label: '✅ Continue to Next Step', value: 'continue_to_setup' },
            { label: '➕ Add Another Category', value: 'add_category' },
            { label: '❌ Remove Items', value: 'remove_items' }
          ]);

        const row = new ActionRowBuilder().addComponents(continueSelect);
        
        let itemsList = '';
        items.forEach(item => {
          itemsList += `${item.name} x${item.quantity}\n`;
        });

        await interaction.reply({ 
          content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
          components: [row], 
          flags: 64 
        });
      }
    }

    if (interaction.customId === 'giveaway_continue_select') {
      const choice = interaction.values[0];

      if (choice === 'add_category') {
        const { StringSelectMenuBuilder } = require('discord.js');
        
        const categorySelect = new StringSelectMenuBuilder()
          .setCustomId('giveaway_category_select')
          .setPlaceholder('Select another item category')
          .addOptions([
            { label: 'Huges', value: 'huges', emoji: '🔥' },
            { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
            { label: 'Eggs', value: 'eggs', emoji: '🥚' },
            { label: 'Gifts', value: 'gifts', emoji: '🎁' }
          ]);

        const row = new ActionRowBuilder().addComponents(categorySelect);
        await interaction.reply({ content: 'Select another item category:', components: [row], flags: 64 });
      } else if (choice === 'create_giveaway') {
        // Move to giveaway setup modal
        const giveawayModal = new ModalBuilder()
          .setCustomId('giveaway_setup_modal')
          .setTitle('Create Your Giveaway');

        const descriptionInput = new TextInputBuilder()
          .setCustomId('gwa_description')
          .setLabel('Giveaway Description (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Describe the giveaway...')
          .setRequired(false);

        const durationInput = new TextInputBuilder()
          .setCustomId('gwa_duration')
          .setLabel('Duration (in minutes, max 1440 = 24 hours)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g., 60 for 1 hour, 1440 for 24 hours')
          .setMinLength(1)
          .setMaxLength(4)
          .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(descriptionInput);
        const row2 = new ActionRowBuilder().addComponents(durationInput);

        giveawayModal.addComponents(row1, row2);
        
        delete interaction.user.selectedGiveawayItems;
        delete interaction.user.selectedGiveawayCategory;
        delete interaction.user.selectedGiveawaySubcategory;

        await interaction.showModal(giveawayModal);
      } else if (choice === 'remove_items') {
        // Show items to remove
        const items = interaction.user.giveawayItems || [];
        if (items.length === 0) {
          return await interaction.reply({ content: 'No items to remove.', flags: 64 });
        }

        const { StringSelectMenuBuilder } = require('discord.js');
        
        const removeSelect = new StringSelectMenuBuilder()
          .setCustomId('giveaway_remove_item_select')
          .setPlaceholder('Select items to remove')
          .setMinValues(1)
          .setMaxValues(Math.min(25, items.length));

        items.forEach((item, index) => {
          const emoji = getItemEmoji(item.name);
          removeSelect.addOptions({
            label: `${formatItemName(item.name)} (x${item.quantity})`,
            value: `${index}`,
            emoji: emoji || '📦'
          });
        });

        const row = new ActionRowBuilder().addComponents(removeSelect);
        await interaction.reply({ content: 'Select items to remove:', components: [row], flags: 64 });
      }
    }

    if (interaction.customId === 'giveaway_remove_item_select') {
      const indices = interaction.values.map(v => parseInt(v)).sort((a, b) => b - a);
      const items = interaction.user.giveawayItems || [];

      // Remove items in reverse order to maintain correct indices
      indices.forEach(index => {
        if (index >= 0 && index < items.length) {
          items.splice(index, 1);
        }
      });

      if (items.length === 0) {
        await interaction.reply({ content: 'All items removed. Please add items again.', flags: 64 });
        delete interaction.user.giveawayItems;
      } else {
        // Redisplay the continue select
        const { StringSelectMenuBuilder } = require('discord.js');
        
        const continueSelect = new StringSelectMenuBuilder()
          .setCustomId(`giveaway_continue_select`)
          .setPlaceholder('What would you like to do?')
          .addOptions([
            { label: '✅ Create Giveaway', value: 'create_giveaway' },
            { label: '➕ Add Another Category', value: 'add_category' },
            { label: '❌ Remove Items', value: 'remove_items' }
          ]);

        const row = new ActionRowBuilder().addComponents(continueSelect);
        
        let itemsList = '';
        items.forEach(item => {
          itemsList += `${item.name} x${item.quantity}\n`;
        });

        await interaction.reply({ 
          content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
          components: [row], 
          flags: 64 
        });
      }
    }

    if (interaction.customId === 'inventory_category_select') {
      const category = interaction.values[0];
      const { StringSelectMenuBuilder } = require('discord.js');
      
      if (category === 'diamonds') {
        const diamondsModal = new ModalBuilder()
          .setCustomId('inventory_diamonds_modal')
          .setTitle('Add Diamonds');

        const diamondsInput = new TextInputBuilder()
          .setCustomId('inv_diamonds_amount')
          .setLabel('Amount of Diamonds')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g., 5000, 10K, 1M')
          .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(diamondsInput);
        diamondsModal.addComponents(row1);

        await interaction.showModal(diamondsModal);
        return;
      } else if (category === 'huges') {
        const subcategorySelect = new StringSelectMenuBuilder()
          .setCustomId('inventory_huge_subcategory_select')
          .setPlaceholder('Select a Huge subcategory')
          .addOptions(Object.keys(itemCategories.huges).map(sub => ({
            label: sub,
            value: sub
          })));
        const row = new ActionRowBuilder().addComponents(subcategorySelect);
        await interaction.reply({ content: `Select a subcategory from **Huges**:`, components: [row], flags: 64 });
        return;
      }
      
      const items = itemCategories[category];
      const itemSelect = new StringSelectMenuBuilder()
        .setCustomId(`inventory_item_select_${category}`)
        .setPlaceholder(`Select items from ${category}`)
        .setMaxValues(Math.min(items.length, 25))
        .addOptions(items.slice(0, 25).map(item => ({ 
          label: formatItemName(item), 
          value: item,
          emoji: getItemEmoji(item)
        })));

      const row = new ActionRowBuilder().addComponents(itemSelect);
      await interaction.reply({ content: `Select items from **${category}** category:`, components: [row], flags: 64 });
    }

    if (interaction.customId === 'inventory_huge_subcategory_select') {
      const subcategory = interaction.values[0];
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const items = itemCategories.huges[subcategory];
      const itemSelect = new StringSelectMenuBuilder()
        .setCustomId(`inventory_item_select_huges_${subcategory}`)
        .setPlaceholder(`Select items from ${subcategory}`)
        .setMaxValues(Math.min(items.length, 25))
        .addOptions(items.map(item => ({ 
          label: formatItemName(item), 
          value: item,
          emoji: getItemEmoji(item)
        })));

      const row = new ActionRowBuilder().addComponents(itemSelect);
      await interaction.reply({ content: `Select items from **${subcategory}**:`, components: [row], flags: 64 });
    }

    if (interaction.customId.startsWith('inventory_item_select_')) {
      const parts = interaction.customId.replace('inventory_item_select_', '').split('_');
      let category = parts[0];
      let subcategory = parts.length > 1 ? parts.slice(1).join('_') : null;
      
      const selectedItems = interaction.values;

      interaction.user.selectedInventoryItems = selectedItems;
      interaction.user.selectedInventoryCategory = category;
      interaction.user.selectedInventorySubcategory = subcategory;

      const quantityModal = new ModalBuilder()
        .setCustomId(`inventory_item_quantities_modal`)
        .setTitle('Select Quantities');

      let inputs = [];
      selectedItems.slice(0, 5).forEach((item, index) => {
        const input = new TextInputBuilder()
          .setCustomId(`inv_qty_${index}`)
          .setLabel(`${item} quantity`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('1')
          .setRequired(true)
          .setMaxLength(3);
        inputs.push(new ActionRowBuilder().addComponents(input));
      });

      quantityModal.addComponents(inputs);
      await interaction.showModal(quantityModal);
    }

    if (interaction.customId === 'giveaway_category_select') {
      const category = interaction.values[0];
      const { StringSelectMenuBuilder } = require('discord.js');
      
      if (category === 'huges') {
        const subcategorySelect = new StringSelectMenuBuilder()
          .setCustomId('giveaway_huge_subcategory_select')
          .setPlaceholder('Select a Huge subcategory')
          .addOptions(Object.keys(giveawayItemCategories.huges).map(sub => ({
            label: sub,
            value: sub
          })));
        const row = new ActionRowBuilder().addComponents(subcategorySelect);
        await interaction.reply({ content: `Select a subcategory from **Huges**:`, components: [row], flags: 64 });
        return;
      }
      
      const items = giveawayItemCategories[category];
      const itemSelect = new StringSelectMenuBuilder()
        .setCustomId(`giveaway_item_select_${category}`)
        .setPlaceholder(`Select items from ${category}`)
        .setMaxValues(Math.min(items.length, 25))
        .addOptions(items.slice(0, 25).map(item => ({ 
          label: formatItemName(item), 
          value: item,
          emoji: getItemEmoji(item)
        })));

      const row = new ActionRowBuilder().addComponents(itemSelect);
      await interaction.reply({ content: `Select items from **${category}** category:`, components: [row], flags: 64 });
    }

    if (interaction.customId === 'giveaway_huge_subcategory_select') {
      const subcategory = interaction.values[0];
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const items = giveawayItemCategories.huges[subcategory];
      const itemSelect = new StringSelectMenuBuilder()
        .setCustomId(`giveaway_item_select_huges_${subcategory}`)
        .setPlaceholder(`Select items from ${subcategory}`)
        .setMaxValues(Math.min(items.length, 25))
        .addOptions(items.map(item => ({ 
          label: formatItemName(item), 
          value: item,
          emoji: getItemEmoji(item)
        })));

      const row = new ActionRowBuilder().addComponents(itemSelect);
      await interaction.reply({ content: `Select items from **${subcategory}**:`, components: [row], flags: 64 });
    }

    if (interaction.customId.startsWith('giveaway_item_select_')) {
      const parts = interaction.customId.replace('giveaway_item_select_', '').split('_');
      let category = parts[0];
      let subcategory = parts.length > 1 ? parts.slice(1).join('_') : null;
      
      const selectedItems = interaction.values;

      interaction.user.selectedGiveawayItems = selectedItems;
      interaction.user.selectedGiveawayCategory = category;
      interaction.user.selectedGiveawaySubcategory = subcategory;

      const quantityModal = new ModalBuilder()
        .setCustomId(`giveaway_item_quantities_modal`)
        .setTitle('Select Quantities');

      let inputs = [];
      selectedItems.slice(0, 5).forEach((item, index) => {
        const input = new TextInputBuilder()
          .setCustomId(`gwa_qty_${index}`)
          .setLabel(`${item} quantity`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('1')
          .setRequired(true)
          .setMaxLength(3);
        inputs.push(new ActionRowBuilder().addComponents(input));
      });

      quantityModal.addComponents(inputs);
      await interaction.showModal(quantityModal);
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'trade_diamonds_modal') {
      const diamondsStr = interaction.fields.getTextInputValue('diamonds_amount');
      const diamonds = parseBid(diamondsStr);

      if (!interaction.user.tradeItems) {
        interaction.user.tradeItems = [];
      }

      interaction.user.tradeItems.push({ name: `💎 Diamonds`, quantity: diamonds });

      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId('trade_continue_select')
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Confirm and Proceed', value: 'confirm_items' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      let itemsList = '';
      interaction.user.tradeItems.forEach(item => {
        itemsList += `${item.name} x${item.quantity}\n`;
      });

      await interaction.reply({ 
        content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
        components: [row], 
        flags: 64 
      });
      return;
    }

    if (interaction.customId === 'trade_remove_item_select') {
      const indicesToRemove = interaction.values.map(v => parseInt(v)).sort((a, b) => b - a);
      
      indicesToRemove.forEach(idx => {
        if (interaction.user.tradeItems && interaction.user.tradeItems[idx]) {
          interaction.user.tradeItems.splice(idx, 1);
        }
      });

      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId('trade_continue_select')
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Confirm and Proceed', value: 'confirm_items' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      let itemsList = '';
      if (interaction.user.tradeItems && interaction.user.tradeItems.length > 0) {
        interaction.user.tradeItems.forEach(item => {
          itemsList += `${item.name} x${item.quantity}\n`;
        });
      } else {
        itemsList = 'No items selected';
      }

      await interaction.reply({ 
        content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
        components: [row], 
        flags: 64 
      });
    }

    if (interaction.customId.startsWith('offer_diamonds_modal_')) {
      const messageId = interaction.customId.replace('offer_diamonds_modal_', '');
      const diamondsStr = interaction.fields.getTextInputValue('offer_diamonds_amount');
      const diamonds = parseBid(diamondsStr);

      if (!interaction.user.offerTradeItems) {
        interaction.user.offerTradeItems = [];
      }

      interaction.user.offerTradeItems.push({ name: `💎 Diamonds`, quantity: diamonds });

      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId(`offer_continue_select_${messageId}`)
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Confirm and Proceed', value: 'confirm_items' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      let itemsList = '';
      interaction.user.offerTradeItems.forEach(item => {
        itemsList += `${item.name} x${item.quantity}\n`;
      });

      await interaction.reply({ 
        content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
        components: [row], 
        flags: 64 
      });
      return;
    }

    if (interaction.customId === 'inventory_diamonds_modal') {
      const diamondsStr = interaction.fields.getTextInputValue('inv_diamonds_amount');
      const diamonds = parseBid(diamondsStr);

      if (!interaction.user.inventoryItems) {
        interaction.user.inventoryItems = [];
      }

      interaction.user.inventoryItems.push({ name: `💎 Diamonds`, quantity: diamonds });

      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId(`inventory_continue_select`)
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Continue to Next Step', value: 'continue_to_setup' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      let itemsList = '';
      interaction.user.inventoryItems.forEach(item => {
        itemsList += `${item.name} x${item.quantity}\n`;
      });

      await interaction.reply({ 
        content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
        components: [row], 
        flags: 64 
      });
      return;
    }

    if (interaction.customId === 'trade_item_quantities_modal') {
      const selectedItems = interaction.user.selectedTradeItems || [];
      const category = interaction.user.selectedTradeCategory;
      const subcategory = interaction.user.selectedTradeSubcategory;

      // Process quantities
      const itemsWithQty = selectedItems.map((item, index) => {
        const qty = parseInt(interaction.fields.getTextInputValue(`qty_${index}`) || '1');
        return { name: item, quantity: Math.max(1, qty) };
      });

      // Store in user's session
      if (!interaction.user.tradeItems) {
        interaction.user.tradeItems = [];
      }
      interaction.user.tradeItems = interaction.user.tradeItems.concat(itemsWithQty);

      // Show option to add more categories or proceed
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId('trade_continue_select')
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Confirm and Proceed', value: 'confirm_items' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      let itemsList = '';
      interaction.user.tradeItems.forEach(item => {
        itemsList += `${item.name} x${item.quantity}\n`;
      });

      await interaction.reply({ 
        content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
        components: [row], 
        flags: 64 
      });
      return;
    }

    if (interaction.customId.startsWith('offer_item_quantities_modal_')) {
      const messageId = interaction.customId.replace('offer_item_quantities_modal_', '');
      const selectedItems = interaction.user.selectedOfferItems || [];
      const category = interaction.user.selectedOfferCategory;
      const subcategory = interaction.user.selectedOfferSubcategory;

      // Process quantities
      const itemsWithQty = selectedItems.map((item, index) => {
        const qty = parseInt(interaction.fields.getTextInputValue(`offer_qty_${index}`) || '1');
        return { name: item, quantity: Math.max(1, qty) };
      });

      // Store in user's session
      if (!interaction.user.offerTradeItems) {
        interaction.user.offerTradeItems = [];
      }
      interaction.user.offerTradeItems = interaction.user.offerTradeItems.concat(itemsWithQty);

      // Show option to add more categories or proceed
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId(`offer_continue_select_${messageId}`)
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Confirm and Proceed', value: 'confirm_items' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      let itemsList = '';
      interaction.user.offerTradeItems.forEach(item => {
        itemsList += `${item.name} x${item.quantity}\n`;
      });

      await interaction.reply({ 
        content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
        components: [row], 
        flags: 64 
      });
      return;
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'inventory_item_quantities_modal') {
      const selectedItems = interaction.user.selectedInventoryItems || [];
      const category = interaction.user.selectedInventoryCategory;
      const subcategory = interaction.user.selectedInventorySubcategory;

      const itemsWithQty = selectedItems.map((item, index) => {
        const qty = parseInt(interaction.fields.getTextInputValue(`inv_qty_${index}`) || '1');
        return { name: item, quantity: Math.max(1, qty) };
      });

      if (!interaction.user.inventoryItems) {
        interaction.user.inventoryItems = [];
      }
      interaction.user.inventoryItems = interaction.user.inventoryItems.concat(itemsWithQty);

      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId(`inventory_continue_select`)
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Continue to Next Step', value: 'continue_to_setup' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      let itemsList = '';
      interaction.user.inventoryItems.forEach(item => {
        itemsList += `${item.name} x${item.quantity}\n`;
      });

      await interaction.reply({ 
        content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
        components: [row], 
        flags: 64 
      });
      return;
    }

    if (interaction.customId === 'giveaway_item_quantities_modal') {
      const selectedItems = interaction.user.selectedGiveawayItems || [];
      const category = interaction.user.selectedGiveawayCategory;
      const subcategory = interaction.user.selectedGiveawaySubcategory;

      const itemsWithQty = selectedItems.map((item, index) => {
        const qty = parseInt(interaction.fields.getTextInputValue(`gwa_qty_${index}`) || '1');
        return { name: item, quantity: Math.max(1, qty) };
      });

      if (!interaction.user.giveawayItems) {
        interaction.user.giveawayItems = [];
      }
      interaction.user.giveawayItems = interaction.user.giveawayItems.concat(itemsWithQty);

      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId(`giveaway_continue_select`)
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Create Giveaway', value: 'create_giveaway' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      let itemsList = '';
      interaction.user.giveawayItems.forEach(item => {
        itemsList += `${item.name} x${item.quantity}\n`;
      });

      await interaction.reply({ 
        content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
        components: [row], 
        flags: 64 
      });
      return;
    }

    if (interaction.customId === 'inventory_setup_modal') {
      const diamondsStr = interaction.fields.getTextInputValue('inv_diamonds') || '0';
      const lookingFor = interaction.fields.getTextInputValue('inv_looking_for') || 'Not specified';
      const robloxUsername = interaction.fields.getTextInputValue('inv_roblox_username') || '';

      let diamonds = 0;
      if (diamondsStr && diamondsStr !== '0') {
        diamonds = parseBid(diamondsStr);
      }

      const inventoryItems = interaction.user.inventoryItems || [];
      delete interaction.user.inventoryItems;
      delete interaction.user.selectedInventoryItems;
      delete interaction.user.selectedInventoryCategory;
      delete interaction.user.selectedInventorySubcategory;

      // Delete previous inventory if exists
      const previousInventory = inventories.get(interaction.user.id);
      if (previousInventory) {
        try {
          const channel = interaction.guild.channels.cache.get(previousInventory.channelId);
          const message = await channel.messages.fetch(previousInventory.messageId);
          await message.delete();
        } catch (e) {
          // ignore if message not found
        }
      }

      // Create inventory embed
      const embed = new EmbedBuilder()
        .setTitle('📦 Inventory')
        .setColor(0x00a8ff)
        .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
        .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

      if (robloxUsername) {
        embed.setAuthor({ 
          name: interaction.user.username, 
          iconURL: `https://www.roblox.com/bust-thumbnails/v1/individual?userIds=${robloxUsername}&size=420x420&format=Png&isCircular=false` 
        });
      } else {
        embed.setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() });
      }

      const itemsText = formatItemsText(inventoryItems);

      embed.addFields({
        name: `Items${diamonds > 0 ? ` + ${diamonds} 💎` : ''}`,
        value: itemsText,
        inline: true
      });

      embed.addFields({
        name: 'Looking For',
        value: lookingFor,
        inline: true
      });

      const now = new Date();
      const timeStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()} at ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      embed.addFields({
        name: 'Last Edited',
        value: timeStr,
        inline: false
      });

      const updateButton = new ButtonBuilder()
        .setCustomId('inventory_update_button')
        .setLabel('Update Inventory')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(updateButton);

      const targetChannel = redirectInventoryChannelId ? interaction.guild.channels.cache.get(redirectInventoryChannelId) : interaction.channel;
      const message = await targetChannel.send({ embeds: [embed], components: [row] });

      const inventoryData = {
        messageId: message.id,
        channelId: targetChannel.id,
        items: inventoryItems,
        diamonds: diamonds,
        lookingFor: lookingFor,
        robloxUsername: robloxUsername,
        lastEdited: now
      };

      inventories.set(interaction.user.id, inventoryData);

      await interaction.reply({ content: `Inventory created! Posted to the inventory channel.`, flags: 64 });
      return;
    }

    if (interaction.customId === 'giveaway_setup_modal') {
      const giveawayItems = interaction.user.giveawayItems || [];
      const description = interaction.fields.getTextInputValue('gwa_description') || '';
      const durationStr = interaction.fields.getTextInputValue('gwa_duration');
      
      // Validate duration
      let duration = parseInt(durationStr);
      if (isNaN(duration) || duration < 1 || duration > 1440) {
        return interaction.reply({ 
          content: 'Invalid duration. Please enter a number between 1 and 1440 minutes (24 hours).', 
          ephemeral: true 
        });
      }
      
      delete interaction.user.giveawayItems;
      delete interaction.user.selectedGiveawayItems;
      delete interaction.user.selectedGiveawayCategory;
      delete interaction.user.selectedGiveawaySubcategory;

      // Create giveaway embed
      const embed = new EmbedBuilder()
        .setTitle('🎁 Giveaway')
        .setDescription(description ? `**${description}**\n\n**Click the button below to enter the giveaway!**` : '**Click the button below to enter the giveaway!**')
        .setColor(0xFF1493)
        .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
        .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

      // Format giveaway items
      const giveawayItemsText = formatItemsText(giveawayItems);

      embed.addFields({
        name: 'Giveaway Items',
        value: giveawayItemsText,
        inline: false
      });

      embed.addFields({
        name: 'Hosted by',
        value: interaction.user.toString(),
        inline: false
      });

      // Add duration field
      const durationHours = Math.floor(duration / 60);
      const durationMins = duration % 60;
      let durationText = '';
      if (durationHours > 0) durationText += `${durationHours}h `;
      if (durationMins > 0) durationText += `${durationMins}m`;
      if (!durationText) durationText = duration + 'm';
      
      embed.addFields({
        name: 'Duration',
        value: durationText,
        inline: false
      });

      const enterButton = new ButtonBuilder()
        .setCustomId(`giveaway_enter_${Date.now()}`)
        .setLabel('Enter Giveaway')
        .setStyle(ButtonStyle.Success);

      const endButton = new ButtonBuilder()
        .setCustomId(`giveaway_end_${Date.now()}`)
        .setLabel('End Giveaway')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(enterButton, endButton);

      const targetChannel = redirectTradeChannelId ? interaction.guild.channels.cache.get(redirectTradeChannelId) : interaction.channel;
      
      // Send ping message with role mention
      await targetChannel.send(`<@&${config.giveawayRoleId}> **New Giveaway Started!**`);
      
      const message = await targetChannel.send({ embeds: [embed], components: [row] });

      const expiresAt = Date.now() + (duration * 60 * 1000);
      const giveawayData = {
        host: interaction.user,
        items: giveawayItems,
        channelId: targetChannel.id,
        messageId: message.id,
        entries: [],
        duration: duration,
        expiresAt: expiresAt
      };

      giveaways.set(message.id, giveawayData);
      
      // Increment giveaway count for user
      const userId = interaction.user.id;
      userGiveawayCount.set(userId, (userGiveawayCount.get(userId) || 0) + 1);
      
      // Set timeout to end giveaway and decrement counter
      setTimeout(() => {
        giveaways.delete(message.id);
        userGiveawayCount.set(userId, Math.max(0, (userGiveawayCount.get(userId) || 1) - 1));
      }, duration * 60 * 1000);

      await interaction.reply({ content: `Giveaway created! Posted to the channel with role mention! Duration: ${durationText}`, flags: 64 });
      return;
    }

    if (interaction.customId === 'trade_setup_modal') {
      const diamondsStr = interaction.fields.getTextInputValue('trade_diamonds') || '0';
      const targetUsername = interaction.fields.getTextInputValue('trade_target_user') || '';

      let diamonds = 0;
      if (diamondsStr && diamondsStr !== '0') {
        diamonds = parseBid(diamondsStr);
      }

      const hostItems = interaction.user.tradeItems || [];
      delete interaction.user.tradeItems;
      delete interaction.user.selectedTradeItems;
      delete interaction.user.selectedTradeCategory;
      delete interaction.user.selectedTradeSubcategory;

      // Create trade embed
      const embed = new EmbedBuilder()
        .setTitle('Trade Offer')
        .setDescription(`**Host:** ${interaction.user}\n**Status:** Waiting for offers`)
        .setColor(0x0099ff)
        .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
        .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

      // Format host items with quantities
      const hostItemsText = formatItemsText(hostItems);
      
      embed.addFields({
        name: `Host Items${diamonds > 0 ? ` + ${diamonds} 💎` : ''}`,
        value: hostItemsText,
        inline: false
      });

      const offerButton = new ButtonBuilder()
        .setCustomId('trade_offer_button')
        .setLabel('Make Offer')
        .setStyle(ButtonStyle.Primary);

      const deleteButton = new ButtonBuilder()
        .setCustomId(`trade_delete_${Date.now()}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(offerButton, deleteButton);

      const targetChannel = redirectTradeChannelId ? interaction.guild.channels.cache.get(redirectTradeChannelId) : interaction.channel;
      const message = await targetChannel.send({ embeds: [embed], components: [row] });

      const trade = {
        host: interaction.user,
        hostDiamonds: diamonds,
        hostItems: hostItems,
        offers: [],
        channelId: targetChannel.id,
        messageId: message.id,
        accepted: false,
        acceptedUser: null,
        targetUsername: targetUsername
      };

      trades.set(message.id, trade);

      // Increment trade count for user
      const currentCount = userTradeCount.get(interaction.user.id) || 0;
      userTradeCount.set(interaction.user.id, currentCount + 1);

      await interaction.reply({ content: `Trade offer created! ${targetUsername ? `Awaiting response from ${targetUsername}.` : 'Open for all users.'}`, flags: 64 });
      return;
    }

    if (interaction.customId.startsWith('offer_submit_modal_')) {
      const messageId = interaction.customId.replace('offer_submit_modal_', '');
      const diamondsStr = interaction.fields.getTextInputValue('offer_diamonds') || '0';

      let diamonds = 0;
      if (diamondsStr && diamondsStr !== '0') {
        diamonds = parseBid(diamondsStr);
      }

      const offerItems = interaction.user.offerItems || [];
      delete interaction.user.offerItems;
      delete interaction.user.messageId;

      const trade = trades.get(messageId);
      if (!trade) return interaction.reply({ content: 'Trade not found.', flags: 64 });

      // Add offer to trade
      trade.offers.push({
        user: interaction.user,
        diamonds: diamonds,
        items: offerItems,
        timestamp: Date.now()
      });

      // Update trade embed to show grid layout
      await updateTradeEmbed(interaction.guild, trade, messageId);

      // Notify host of new offer
      const channel = interaction.guild.channels.cache.get(trade.channelId);
      if (channel) {
        await channel.send(`📢 ${trade.host}, você recebeu uma oferta de ${interaction.user}!`);
      }

      await interaction.reply({ content: `Offer submitted! Host will accept or decline.`, flags: 64 });
      return;
    }

    if (interaction.customId === 'bid_modal') {
      const auction = Array.from(auctions.values()).find(a => a.channelId === interaction.channel.id);
      if (!auction) return interaction.reply({ content: 'No auction running.', ephemeral: true });

      const diamondsStr = interaction.fields.getTextInputValue('diamonds');
      const items = interaction.fields.getTextInputValue('items') || '';

      let diamonds = 0;
      if (diamondsStr) {
        diamonds = parseBid(diamondsStr);
      }

      if (auction.model === 'items' && diamonds > 0) return interaction.reply({ content: 'This auction is offers only.', ephemeral: true });
      if (auction.model === 'diamonds' && items) return interaction.reply({ content: 'This auction is diamonds only.', ephemeral: true });
      if (auction.model === 'diamonds' && diamonds === 0) return interaction.reply({ content: 'Please enter diamonds.', ephemeral: true });
      if (auction.model === 'items' && !items) return interaction.reply({ content: 'Please enter an offer.', ephemeral: true });

      // Check if bid is higher than current max
      const maxBid = auction.bids.length > 0 ? Math.max(...auction.bids.map(b => b.diamonds)) : auction.startingPrice;
      if (auction.model !== 'items' && diamonds <= maxBid) return interaction.reply({ content: `Your bid must be higher than the current highest bid of ${maxBid} 💎.`, ephemeral: true });

      auction.bids.push({ user: interaction.user, diamonds, items, timestamp: Date.now() });
      interaction.reply(`Bid placed: ${diamonds > 0 ? `${diamonds} 💎` : ''}${items ? ` and ${items}` : ''}`);
    }

    if (interaction.customId === 'auction_modal') {
      const title = interaction.fields.getTextInputValue('title');
      const description = interaction.fields.getTextInputValue('description');
      const startingPriceStr = interaction.fields.getTextInputValue('starting_price');
      const model = interaction.fields.getTextInputValue('model').toLowerCase();

      if (!['diamonds', 'items', 'both'].includes(model)) return interaction.reply({ content: 'Invalid model. Use diamonds, items/offer, or both.', ephemeral: true });
      const time = 60; // Fixed to 60 seconds
      const startingPrice = parseBid(startingPriceStr);
      if (isNaN(startingPrice) || startingPrice < 0) return interaction.reply({ content: 'Invalid starting price.', ephemeral: true });

      if (auctions.size > 0) {
        return interaction.reply({ content: 'An auction is already running in the server. Please wait for it to end.', ephemeral: true });
      }

      const auction = {
        host: interaction.user,
        title,
        description,
        model,
        time,
        startingPrice,
        bids: [],
        started: new Date(),
        channelId: interaction.channel.id
      };

      const targetChannel = redirectChannelId ? interaction.guild.channels.cache.get(redirectChannelId) : interaction.channel;
      if (!targetChannel) return interaction.reply({ content: 'Redirect channel not found.', ephemeral: true });

      // Send ping message first
      await targetChannel.send('-# ||<@&1461741243427197132>||');

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(`${description}\n\n**Looking For:** ${model}\n**Starting Price:** ${formatBid(startingPrice)} 💎\n**Current Bid:** ${formatBid(startingPrice)} 💎\n**Time Remaining:** ${time}s\n**Hosted by:** ${interaction.user}`)
        .setColor(0x00ff00)
        .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
        .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('bid_button')
            .setLabel('Bid')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('view_bids_button')
            .setLabel('View Bids')
            .setStyle(ButtonStyle.Secondary)
        );

      const message = await targetChannel.send({ embeds: [embed], components: [row] });
      auction.messageId = message.id;
      auction.channelId = targetChannel.id;
      auctions.set(targetChannel.id, auction);

      await interaction.reply({ content: `Auction "${title}" started in ${targetChannel}!`, ephemeral: true });

      // Start timer
      auction.timer = setTimeout(async () => {
        clearInterval(auction.updateInterval);
        await endAuction(targetChannel);
      }, time * 1000);

      // Update embed every second
      auction.updateInterval = setInterval(async () => {
        const remaining = Math.max(0, Math.ceil((auction.started.getTime() + auction.time * 1000 - Date.now()) / 1000));
        if (remaining <= 0) {
          clearInterval(auction.updateInterval);
          return;
        }
        const currentBid = auction.bids.length > 0 ? Math.max(...auction.bids.map(b => b.diamonds)) : auction.startingPrice;
        const updatedEmbed = new EmbedBuilder()
          .setTitle(auction.title)
          .setDescription(`${auction.description}\n\n**Looking For:** ${auction.model}\n**Starting Price:** ${formatBid(auction.startingPrice)} 💎\n**Current Bid:** ${formatBid(currentBid)} 💎\n**Time Remaining:** ${remaining}s\n**Hosted by:** ${auction.host}`)
          .setColor(0x00ff00)
          .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
          .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');
        try {
          await message.edit({ embeds: [updatedEmbed], components: [row] });
        } catch (e) {
          // ignore if message deleted
        }
      }, 1000);
    }

    if (interaction.customId.startsWith('proof_image_modal_trade_')) {
      const messageId = interaction.customId.replace('proof_image_modal_trade_', '');
      const description = interaction.fields.getTextInputValue('proof_description') || '';
      const trade = trades.get(messageId);

      if (!trade) return interaction.reply({ content: 'Trade not found.', ephemeral: true });

      // Check if user has attachments
      if (interaction.message && interaction.message.attachments.size > 0) {
        // User needs to upload image via button with attachments
        return interaction.reply({ 
          content: '❌ Please use the file upload feature. Reply to this message with an image attachment.',
          ephemeral: true 
        });
      }

      // For now, show instruction
      await interaction.reply({
        content: '📸 Please attach the proof image to your next message in this channel.\n\nAfter you send the image, the proof will be automatically forwarded to the records channel.',
        ephemeral: false
      });

      // Store waiting state
      interaction.user.waitingForProof = {
        tradeMessageId: messageId,
        description: description,
        type: 'trade'
      };
    }

    if (interaction.customId === 'proof_image_modal_auction') {
      const description = interaction.fields.getTextInputValue('proof_description') || '';

      // Show instruction
      await interaction.reply({
        content: '📸 Please attach the proof image to your next message in this channel.\n\nAfter you send the image, the proof will be automatically forwarded to the records channel.',
        ephemeral: false
      });

      // Store waiting state
      interaction.user.waitingForProof = {
        tradeMessageId: null,
        description: description,
        type: 'auction'
      };
    }
  }
});

async function updateTradeEmbed(guild, trade, messageId) {
  if (!guild) return;
  
  try {
    const channel = guild.channels.cache.get(trade.channelId);
    if (!channel) return;

    const message = await channel.messages.fetch(messageId);
    if (!message) return;

    // Create embed with grid layout
    const embed = new EmbedBuilder()
      .setTitle('Trade Offer')
      .setColor(trade.accepted ? 0x00ff00 : 0x0099ff)
      .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
      .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

    if (trade.accepted) {
      if (trade.adminCancelled) {
        embed.setDescription(`**Status:** ❌ Cancelled by an admin\n\n**Host:** ${trade.host}`);
      } else {
        embed.setDescription(`**Status:** ✅ Trade Accepted\n\n**Host:** ${trade.host}\n**Guest:** ${trade.acceptedUser}`);
      }
    } else if (trade.offers.length > 0) {
      embed.setDescription(`**Status:** Awaiting Host Decision\n\n**Host:** ${trade.host}`);
    } else {
      embed.setDescription(`**Status:** Waiting for offers\n\n**Host:** ${trade.host}`);
    }

    const hostItemsText = formatItemsText(trade.hostItems);
    embed.addFields({
      name: `Host${trade.hostDiamonds > 0 ? ` (+ ${trade.hostDiamonds} 💎)` : ''}`,
      value: hostItemsText,
      inline: true
    });

    if (trade.offers.length > 0 && !trade.accepted) {
      const lastOffer = trade.offers[trade.offers.length - 1];
      const guestItemsText = formatItemsText(lastOffer.items);
      embed.addFields({
        name: `${lastOffer.user.username}${lastOffer.diamonds > 0 ? ` (+ ${lastOffer.diamonds} 💎)` : ''}`,
        value: guestItemsText,
        inline: true
      });
    } else if (trade.accepted) {
      const acceptedOffer = trade.offers.find(o => o.user.id === trade.acceptedUser.id);
      if (acceptedOffer) {
        const guestItemsText = formatItemsText(acceptedOffer.items);
        embed.addFields({
          name: `${acceptedOffer.user.username}${acceptedOffer.diamonds > 0 ? ` (+ ${acceptedOffer.diamonds} 💎)` : ''}`,
          value: guestItemsText,
          inline: true
        });
      }
    }

    let components = [];

    if (!trade.accepted && trade.offers.length > 0) {
      const acceptButton = new ButtonBuilder()
        .setCustomId(`trade_accept_${messageId}`)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success);

      const declineButton = new ButtonBuilder()
        .setCustomId(`trade_decline_${messageId}`)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Danger);

      components.push(new ActionRowBuilder().addComponents(acceptButton, declineButton));
    } else if (trade.accepted) {
      // Add Upload Proof Image button for accepted trades
      const proofButton = new ButtonBuilder()
        .setCustomId(`upload_proof_trade_${messageId}`)
        .setLabel('Upload Proof Image')
        .setStyle(ButtonStyle.Primary);

      const deleteButton = new ButtonBuilder()
        .setCustomId(`trade_delete_${Date.now()}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger);

      components.push(new ActionRowBuilder().addComponents(proofButton, deleteButton));
    } else if (!trade.accepted) {
      const offerButton = new ButtonBuilder()
        .setCustomId('trade_offer_button')
        .setLabel('Make Offer')
        .setStyle(ButtonStyle.Primary);

      const deleteButton = new ButtonBuilder()
        .setCustomId(`trade_delete_${Date.now()}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger);

      components.push(new ActionRowBuilder().addComponents(offerButton, deleteButton));
    }

    await message.edit({ embeds: [embed], components });
  } catch (e) {
    console.error('Error updating trade embed:', e);
  }
}

async function endAuction(channel) {
  const auction = auctions.get(channel.id);
  if (!auction) return;

  clearTimeout(auction.timer);
  clearInterval(auction.updateInterval);
  auctions.delete(channel.id);

  if (auction.bids.length === 0) {
    return channel.send('Auction ended with no bids.');
  }

  // Find winner: highest diamonds, if tie, first bid
  auction.bids.sort((a, b) => b.diamonds - a.diamonds || auction.bids.indexOf(a) - auction.bids.indexOf(b));
  const winner = auction.bids[0];

  const embed = new EmbedBuilder()
    .setTitle('Auction Ended!')
    .setDescription(`**Title:** ${auction.title}\n**Winner:** ${winner.user}\n**Bid:** ${winner.diamonds} 💎${winner.items ? ` and ${winner.items}` : ''}`)
    .setColor(0xff0000)
    .setFooter({ text: 'Version 1.0.9 | Made By Atlas' });

  // Add Upload Proof Image button
  const proofButton = new ButtonBuilder()
    .setCustomId(`upload_proof_auction_${Date.now()}`)
    .setLabel('Upload Proof Image')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(proofButton);

  await channel.send({ embeds: [embed], components: [row] });
}

client.login(process.env.TOKEN || config.token);
