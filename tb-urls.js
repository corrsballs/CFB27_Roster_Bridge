const ROSTER_JSON = /^https:\/\/cdn\.mcr\.ea\.com\/\d+\/bundles-users\/[^/]+\/[^/]+\/[^/]*nonce-primary\.json(?:[?#].*)?$/i;

const TEAM_PAGE = /\/team-builder\/(?:team-create\/brand|preview)\/([^/?#]+)/i;

const TEAM_BUILDER_PAGE = /^https:\/\/www\.ea\.com\/[^?#]*\/team-builder(?:[/?#]|$)/i;

const EA_CDN = /^https:\/\/cdn\.mcr\.ea\.com\//i;

const DEBUGGER_PATTERN = "https://cdn.mcr.ea.com/*/bundles-users/*/*/*nonce-primary.json*";

const TEAM_BUILDER_MATCH = "https://www.ea.com/games/ea-sports-college-football/team-builder/*";
