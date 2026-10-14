const config = require('../config');

// In-memory cache for IP reputation (IP -> { isVpn, details, timestamp })
const ipCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class VpnDetector {
  /**
   * Checks if an IP is a local/private network IP
   */
  static isLocalIp(ip) {
    if (!ip) return true;
    return (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === 'localhost' ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      (ip.startsWith('172.') && parseInt(ip.split('.')[1], 10) >= 16 && parseInt(ip.split('.')[1], 10) <= 31)
    );
  }

  /**
   * Checks if an IP is a VPN, Proxy, Datacenter, or Tor exit node
   */
  static async checkIp(ip) {
    // Clean IP (e.g. ::ffff:1.2.3.4 -> 1.2.3.4)
    if (ip && ip.startsWith('::ffff:')) {
      ip = ip.replace('::ffff:', '');
    }

    if (!ip || this.isLocalIp(ip)) {
      return {
        isVpn: false,
        provider: 'Local / Development',
        country: 'Local',
        cached: false
      };
    }

    // Check memory cache
    const cached = ipCache.get(ip);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { ...cached.data, cached: true };
    }

    // 1. Try ProxyCheck.io if API key configured
    if (config.security.proxyCheckKey) {
      try {
        const response = await fetch(
          `https://proxycheck.io/v2/${ip}?key=${config.security.proxyCheckKey}&vpn=1&asn=1&risk=1`
        );
        const data = await response.json();
        if (data.status === 'ok' && data[ip]) {
          const info = data[ip];
          const isVpn = info.proxy === 'yes';
          const result = {
            isVpn,
            provider: info.provider || info.organisation || info.asn || 'Unknown',
            country: info.country || 'Unknown',
            type: info.type || 'Proxy/VPN',
            risk: info.risk || 0
          };
          ipCache.set(ip, { data: result, timestamp: Date.now() });
          return result;
        }
      } catch (err) {
        console.error('[VPN Detector] ProxyCheck.io query error:', err.message);
      }
    }

    // 2. Free Fallback via IP-API.com
    try {
      const response = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,isp,org,as,mobile,proxy,hosting,query`
      );
      const data = await response.json();

      if (data.status === 'success') {
        // hosting === true means it's a datacenter / cloud server (AWS, DigitalOcean, OVH, etc.), which 99% of VPNs use
        const isVpn = Boolean(data.proxy || data.hosting);
        const result = {
          isVpn,
          provider: data.isp || data.org || data.as || 'Unknown',
          country: data.country || 'Unknown',
          city: data.city || 'Unknown',
          hosting: Boolean(data.hosting),
          proxy: Boolean(data.proxy)
        };
        ipCache.set(ip, { data: result, timestamp: Date.now() });
        return result;
      }
    } catch (err) {
      console.error('[VPN Detector] IP-API query error:', err.message);
    }

    // Safe fallback if external service fails
    return {
      isVpn: false,
      provider: 'Unknown (Check Failed)',
      country: 'Unknown'
    };
  }
}

module.exports = VpnDetector;
