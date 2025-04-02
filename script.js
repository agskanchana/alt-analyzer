// Initialize tooltips
document.addEventListener('DOMContentLoaded', function() {
    // Enable tooltips everywhere
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    });

    // Rest of your code...
    const sitemapUrlInput = document.getElementById('sitemap-url');
    const websiteUrlInput = document.getElementById('website-url');
    const maxPagesInput = document.getElementById('max-pages');
    const maxDepthInput = document.getElementById('max-depth');
    const stayOnDomainCheckbox = document.getElementById('stay-on-domain');
    const includeExternalImagesCheckbox = document.getElementById('include-external-images');
    const analyzeSitemapBtn = document.getElementById('analyze-sitemap-btn');
    const crawlSiteBtn = document.getElementById('crawl-site-btn');
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loading-text');
    const progressBar = document.getElementById('progress-bar');
    const results = document.getElementById('results');
    const summary = document.getElementById('summary');
    const summaryContent = document.getElementById('summary-content');
    const resultsTable = document.getElementById('results-table');
    const resultsBody = document.getElementById('results-body');

    // Track visited URLs for crawler
    let visitedUrls = new Set();
    let urlQueue = [];
    let currentDepth = 0;
    let maxDepth = 3;
    let maxPages = 50;
    let baseDomain = '';
    let includeExternalImages = false;
    let shouldStayOnDomain = true;

    // Sitemap analysis button click handler
    analyzeSitemapBtn.addEventListener('click', function() {
        const sitemapUrl = sitemapUrlInput.value.trim();

        if (!sitemapUrl) {
            alert('Please enter a sitemap URL');
            return;
        }

        if (!sitemapUrl.match(/https?:\/\/.+\.xml$/i)) {
            alert('Please enter a valid XML sitemap URL');
            return;
        }

        // Reset and start analysis
        resetResults();
        startSitemapAnalysis(sitemapUrl);
    });

    // Website crawl button click handler
    crawlSiteBtn.addEventListener('click', function() {
        const websiteUrl = websiteUrlInput.value.trim();

        if (!websiteUrl) {
            alert('Please enter a website URL');
            return;
        }

        if (!websiteUrl.match(/^https?:\/\//i)) {
            alert('Please enter a valid website URL starting with http:// or https://');
            return;
        }

        // Get crawler settings
        maxPages = parseInt(maxPagesInput.value) || 50;
        maxDepth = parseInt(maxDepthInput.value) || 3;
        shouldStayOnDomain = stayOnDomainCheckbox.checked;
        includeExternalImages = includeExternalImagesCheckbox.checked;

        // Extract base domain for filtering
        try {
            const url = new URL(websiteUrl);
            baseDomain = url.hostname;
        } catch (e) {
            alert('Invalid URL format');
            return;
        }

        // Reset and start crawling
        resetResults();
        startWebsiteCrawl(websiteUrl);
    });

    // Original sitemap analysis function (keep this as-is)
    async function startSitemapAnalysis(sitemapUrl) {
        loadingText.textContent = "Analyzing sitemap...";
        try {
            // Show loading
            loading.style.display = 'block';
            console.log('Starting analysis of: ' + sitemapUrl);

            // Fetch the sitemap directly - we'll handle CORS another way
            const xmlText = await fetchWithProxy(sitemapUrl);
            console.log('Fetched XML content length:', xmlText.length);
            console.log('XML content preview:', xmlText.substring(0, 500)); // Log a preview of the XML

            // Parse the XML
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

            // Debug - log the parsed XML and check for parsing errors
            console.log('Parsed XML document:', xmlDoc.documentElement.tagName);
            const parsingError = xmlDoc.getElementsByTagName('parsererror');
            if (parsingError.length > 0) {
                throw new Error('XML parsing error: ' + parsingError[0].textContent);
            }

            // Define namespace
            const ns = "http://www.sitemaps.org/schemas/sitemap/0.9";

            // Detect the type of sitemap using namespace-aware methods
            const sitemapIndex = xmlDoc.getElementsByTagNameNS(ns, 'sitemapindex').length > 0;
            const urlSet = xmlDoc.getElementsByTagNameNS(ns, 'urlset').length > 0;

            console.log('Is sitemap index?', sitemapIndex);
            console.log('Is regular sitemap?', urlSet);

            let pageUrls = [];

            if (sitemapIndex) {
                // This is a sitemap index
                console.log('Detected sitemap index');
                const sitemapElements = xmlDoc.getElementsByTagNameNS(ns, 'sitemap');
                console.log(`Found ${sitemapElements.length} sitemap elements`);

                const locElements = [];

                // Get all loc elements within sitemaps
                for (let i = 0; i < sitemapElements.length; i++) {
                    const locElement = sitemapElements[i].getElementsByTagNameNS(ns, 'loc');
                    if (locElement.length > 0) {
                        locElements.push(locElement[0]);
                    }
                }

                console.log(`Found ${locElements.length} location elements in sitemap index`);
                summary.style.display = 'block';
                summaryContent.innerHTML = `<p>Found ${locElements.length} sitemaps in the index.</p>`;

                // For each sitemap in the index, get its URLs
                for (let i = 0; i < locElements.length; i++) {
                    const subSitemapUrl = locElements[i].textContent.trim();
                    console.log(`Processing sub-sitemap ${i+1}/${locElements.length}: ${subSitemapUrl}`);

                    // Update progress
                    updateProgress((i / locElements.length) * 20); // First 20% for sitemap collection

                    // Get the URLs from this sitemap
                    try {
                        const subSitemapUrls = await fetchSitemapUrls(subSitemapUrl);
                        pageUrls = pageUrls.concat(subSitemapUrls);
                        console.log(`Found ${subSitemapUrls.length} URLs in sitemap ${i+1}`);
                    } catch (error) {
                        console.error(`Error processing sub-sitemap ${subSitemapUrl}:`, error);
                    }
                }
            } else if (urlSet) {
                // This is a regular sitemap
                console.log('Detected regular sitemap');
                const urlElements = xmlDoc.getElementsByTagNameNS(ns, 'url');
                console.log(`Found ${urlElements.length} URL elements`);

                for (let i = 0; i < urlElements.length; i++) {
                    const locElements = urlElements[i].getElementsByTagNameNS(ns, 'loc');
                    if (locElements.length > 0) {
                        pageUrls.push(locElements[0].textContent.trim());
                    }
                }
            } else {
                // If we can't detect the format, try dump the XML structure
                console.error('Could not identify sitemap format - neither sitemapindex nor urlset found');
                console.log('Root element:', xmlDoc.documentElement.tagName);
                console.log('Root children:', xmlDoc.documentElement.childNodes.length);
                console.log('First few children tags:',
                    Array.from(xmlDoc.documentElement.childNodes)
                        .filter(node => node.nodeType === 1)
                        .slice(0, 5)
                        .map(node => node.tagName)
                );
                throw new Error('Could not identify sitemap format - neither sitemapindex nor urlset found');
            }

            console.log(`Total unique URLs found: ${pageUrls.length}`);
            summaryContent.innerHTML = `<p>Found ${pageUrls.length} unique URLs in the sitemap(s).</p>
                                      <p>Now checking each page for images...</p>`;

            // Limit to a reasonable number of URLs for performance
            const MAX_URLS = 100;
            if (pageUrls.length > MAX_URLS) {
                console.log(`Limiting analysis to ${MAX_URLS} URLs for performance`);
                pageUrls = pageUrls.slice(0, MAX_URLS);
            }

            // Update table header for image analysis
            const thead = resultsTable.querySelector('thead');
            thead.innerHTML = `
                <tr>
                    <th>#</th>
                    <th>Page URL <button id="toggle-urls" class="btn btn-sm btn-outline-secondary ms-2" title="Toggle URL display">
                        <i class="fas fa-expand-alt"></i>
                    </button></th>
                    <th>Image</th>
                    <th>Alt Text</th>
                </tr>
            `;

            // Show the table - we'll populate it as we go
            resultsTable.style.display = 'table';

            // Set up the URL toggle functionality
            setupUrlToggle();

            // Initialize counters for images
            let imageStats = {
                total: 0,
                missing: 0
            };

            // Process each URL to check for images and alt tags
            await processUrlsForImages(pageUrls, imageStats);

            // Display final summary
            displayFinalSummary(imageStats);

            // Hide loading
            loading.style.display = 'none';

        } catch (error) {
            console.error('Error analyzing sitemap:', error);
            loading.style.display = 'none';
            alert(`Error analyzing sitemap: ${error.message}`);
        }
    }

    // New website crawling function
    async function startWebsiteCrawl(startUrl) {
        try {
            // Reset crawler state
            visitedUrls = new Set();
            urlQueue = [];
            currentDepth = 0;

            // Initialize crawl
            urlQueue.push({ url: startUrl, depth: 0 });

            // Show loading
            loading.style.display = 'block';
            loadingText.textContent = "Crawling website...";
            console.log('Starting crawl from:', startUrl);

            // Update the summary
            summary.style.display = 'block';
            summaryContent.innerHTML = `<p>Crawling website starting at ${startUrl}</p>
                                      <p>Settings: Max pages: ${maxPages}, Max depth: ${maxDepth},
                                      Stay on domain: ${shouldStayOnDomain}</p>`;

            // Initialize counters for images
            let imageStats = {
                total: 0,
                missing: 0,
                pages: 0
            };

            // Update table header for image analysis
            const thead = resultsTable.querySelector('thead');
            thead.innerHTML = `
                <tr>
                    <th>#</th>
                    <th>Page URL <button id="toggle-urls" class="btn btn-sm btn-outline-secondary ms-2" title="Toggle URL display">
                        <i class="fas fa-expand-alt"></i>
                    </button></th>
                    <th>Image</th>
                    <th>Alt Text</th>
                </tr>
            `;

            // Show the table - we'll populate it as we go
            resultsTable.style.display = 'table';

            // Set up the URL toggle functionality
            setupUrlToggle();

            // Process the queue
            let urlsProcessed = 0;

            while (urlQueue.length > 0 && urlsProcessed < maxPages) {
                const current = urlQueue.shift();
                const url = current.url;
                const depth = current.depth;

                // Skip if we've already visited this URL
                if (visitedUrls.has(url)) {
                    continue;
                }

                visitedUrls.add(url);
                urlsProcessed++;
                imageStats.pages++;

                // Update progress
                updateProgress((urlsProcessed / maxPages) * 100);
                loadingText.textContent = `Crawling page ${urlsProcessed}/${maxPages}...`;

                console.log(`Crawling [${depth}] ${url} (${urlsProcessed}/${maxPages})`);

                try {
                    // Process this page for images
                    const imagesFound = await processUrl(url, imageStats);

                    // Only continue crawling if we're not at max depth
                    if (depth < maxDepth) {
                        // Get links from the page and add them to the queue
                        const newUrls = await extractLinksFromPage(url, depth);

                        // Add new URLs to the queue
                        urlQueue.push(...newUrls.map(newUrl => ({
                            url: newUrl,
                            depth: depth + 1
                        })));
                    }
                } catch (error) {
                    console.error(`Error processing ${url}:`, error);
                }
            }

            // Display final summary
            displayFinalSummary(imageStats);

            // Hide loading
            loading.style.display = 'none';

        } catch (error) {
            console.error('Error during website crawl:', error);
            loading.style.display = 'none';
            alert(`Error during website crawl: ${error.message}`);
        }
    }

    // Add this function to help debug crawler issues
    function logCrawlerStatus(message, data = null) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] CRAWLER: ${message}`);
        if (data) {
            console.log(data);
        }
    }

    // Enhance extractLinksFromPage with better debugging
    async function extractLinksFromPage(url, currentDepth) {
        try {
            logCrawlerStatus(`Extracting links from ${url} at depth ${currentDepth}`);

            // Fetch the page
            const html = await fetchWithProxy(url);
            logCrawlerStatus(`Fetched HTML (${html.length} bytes)`);

            // Parse the HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Find all links
            const links = doc.getElementsByTagName('a');
            logCrawlerStatus(`Found ${links.length} links on page`);

            const newUrls = [];

            for (let i = 0; i < links.length; i++) {
                const href = links[i].getAttribute('href');

                // Skip empty links, anchors, javascript, etc.
                if (!href || href.startsWith('#') || href.startsWith('javascript:') ||
                    href.startsWith('mailto:') || href.startsWith('tel:')) {
                    continue;
                }

                try {
                    // Normalize URL
                    const absoluteUrl = new URL(href, url).href;

                    // Skip if we've already visited or queued this URL
                    if (visitedUrls.has(absoluteUrl) || urlQueue.some(item => item.url === absoluteUrl)) {
                        continue;
                    }

                    // Check if we should stay on the same domain
                    if (shouldStayOnDomain) {
                        const linkDomain = new URL(absoluteUrl).hostname;
                        if (linkDomain !== baseDomain) {
                            logCrawlerStatus(`Skipping external domain: ${linkDomain} !== ${baseDomain}`);
                            continue;
                        }
                    }

                    // Skip non-HTML resources
                    const fileExtension = absoluteUrl.split('?')[0].split('#')[0].split('.').pop().toLowerCase();
                    const nonHtmlExtensions = [
                        'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico',
                        'css', 'js', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar', 'exe',
                        'mp3', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'
                    ];

                    if (nonHtmlExtensions.includes(fileExtension)) {
                        continue;
                    }

                    newUrls.push(absoluteUrl);
                    logCrawlerStatus(`Added URL to queue: ${absoluteUrl}`);

                } catch (e) {
                    // Skip invalid URLs
                    logCrawlerStatus(`Invalid URL: ${href} on page ${url}`, e);
                }
            }

            logCrawlerStatus(`Extracted ${newUrls.length} new URLs to crawl`);
            return newUrls;
        } catch (error) {
            logCrawlerStatus(`Error extracting links from ${url}:`, error);
            return [];
        }
    }

    async function fetchSitemapUrls(sitemapUrl) {
        try {
            // Fetch the sitemap
            console.log('Fetching sub-sitemap:', sitemapUrl);
            const xmlText = await fetchWithProxy(sitemapUrl);
            console.log(`Fetched sub-sitemap content length: ${xmlText.length}`);

            // Parse the XML
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

            // Check for parsing errors
            const parsingError = xmlDoc.getElementsByTagName('parsererror');
            if (parsingError.length > 0) {
                console.error('XML parsing error in sub-sitemap:', parsingError[0].textContent);
                return [];
            }

            // Define namespace
            const ns = "http://www.sitemaps.org/schemas/sitemap/0.9";

            // Extract URLs
            const urls = [];
            const urlElements = xmlDoc.getElementsByTagNameNS(ns, 'url');
            console.log(`Found ${urlElements.length} URLs in sub-sitemap`);

            for (let i = 0; i < urlElements.length; i++) {
                const locElements = urlElements[i].getElementsByTagNameNS(ns, 'loc');
                if (locElements.length > 0) {
                    urls.push(locElements[0].textContent.trim());
                }
            }

            return urls;
        } catch (error) {
            console.error('Error fetching sub-sitemap:', error, sitemapUrl);
            return [];
        }
    }

    async function processUrlsForImages(urls, stats) {
        const batchSize = 5; // Process 5 URLs at a time to avoid overwhelming the browser
        let processedCount = 0;

        for (let i = 0; i < urls.length; i += batchSize) {
            const batch = urls.slice(i, i + batchSize);
            const batchPromises = batch.map(url => processUrl(url, stats));

            await Promise.all(batchPromises);

            processedCount += batch.length;
            // Calculate progress: 20% for sitemap collection, 80% for page processing
            const progress = 20 + ((processedCount / urls.length) * 80);
            updateProgress(progress);
        }
    }

    async function processUrl(url, stats) {
        try {
            console.log(`Processing page: ${url}`);
            // Fetch the page
            const html = await fetchWithProxy(url);

            // Parse the HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Find all images - both regular and lazy-loaded ones
            const images = doc.getElementsByTagName('img');
            console.log(`Found ${images.length} image elements on ${url}`);

            // Process each image
            let processedImages = 0;
            for (let i = 0; i < images.length; i++) {
                const img = images[i];

                // Check for regular src or data-src (used by many lazyload implementations)
                let src = img.getAttribute('src');

                // If no src or it's a tiny placeholder, look for data-src or other common lazy load attributes
                if (!src || src.startsWith('data:') || src.includes('blank.gif') || src.includes('placeholder')) {
                    // Check common lazy load attribute patterns
                    const dataSrc = img.getAttribute('data-src') ||
                                    img.getAttribute('data-lazy-src') ||
                                    img.getAttribute('data-original') ||
                                    img.getAttribute('lazy-src');

                    if (dataSrc) {
                        src = dataSrc;
                        console.log(`Found lazy-loaded image with data-src: ${dataSrc}`);
                    }
                }

                const alt = img.getAttribute('alt');

                // Skip tiny images or icons by checking attributes
                const width = parseInt(img.getAttribute('width') || '0');
                const height = parseInt(img.getAttribute('height') || '0');

                if ((width > 0 && width < 50) || (height > 0 && height < 50)) {
                    console.log(`Skipping small image: ${src} (${width}x${height})`);
                    continue;
                }

                // Skip if no src or data URI after checking for lazy load attributes
                if (!src || src.startsWith('data:') || src.length < 5) {
                    continue;
                }

                // Try to get absolute URL
                let imgUrl;
                try {
                    imgUrl = new URL(src, url).href;

                    // Check if we should include external images
                    if (!includeExternalImages) {
                        const imgDomain = new URL(imgUrl).hostname;
                        if (imgDomain !== baseDomain) {
                            console.log(`Skipping external image: ${imgUrl}`);
                            continue;
                        }
                    }
                } catch (e) {
                    console.warn(`Invalid image URL: ${src} on page ${url}`);
                    continue;
                }

                processedImages++;

                // Update stats
                stats.total++;
                if (!alt) {
                    stats.missing++;
                }

                // Add to results table
                addImageResult(url, imgUrl, alt || '', stats.total);
            }

            console.log(`Processed ${processedImages} total images on ${url}`);
            return processedImages;
        } catch (error) {
            console.error(`Error processing ${url}:`, error);
            return 0;
        }
    }

    function addImageResult(pageUrl, imgSrc, altText, index) {
        const row = document.createElement('tr');

        // Determine if alt is missing
        const isMissing = !altText;

        // Set row class if alt is missing
        if (isMissing) {
            row.className = 'table-danger';
        }

        // Create a URL object to extract parts
        let urlDisplay;
        try {
            const urlObj = new URL(pageUrl);
            const domain = urlObj.hostname;
            const path = urlObj.pathname;

            urlDisplay = `
                <div class="page-url">
                    <a href="${pageUrl}" target="_blank" class="" title="${pageUrl}">
                        ${pageUrl}
                    </a>
                    <button class="btn btn-sm btn-outline-secondary ms-1 copy-url" title="Copy URL" data-url="${pageUrl}">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            `;
        } catch (e) {
            urlDisplay = `<div class="page-url">${pageUrl}</div>`;
        }

        row.innerHTML = `
            <td>${index}</td>
            <td>${urlDisplay}</td>
            <td><img src="${imgSrc}" class="img-thumbnail"
                onerror="this.onerror=null; this.src='https://via.placeholder.com/150x75?text=Image+Not+Available'"></td>
            <td>${isMissing ? '<span class="badge bg-danger">Missing Alt Text</span>' : altText}</td>
        `;

        resultsBody.appendChild(row);

        // Add event listener for the copy button
        const copyBtn = row.querySelector('.copy-url');
        if (copyBtn) {
            copyBtn.addEventListener('click', function(e) {
                e.preventDefault();
                const url = this.getAttribute('data-url');
                navigator.clipboard.writeText(url).then(() => {
                    // Change button to show copied
                    const originalHTML = this.innerHTML;
                    this.innerHTML = '<i class="fas fa-check"></i>';
                    this.classList.add('btn-success');
                    this.classList.remove('btn-outline-secondary');

                    // Reset button after a short delay
                    setTimeout(() => {
                        this.innerHTML = originalHTML;
                        this.classList.remove('btn-success');
                        this.classList.add('btn-outline-secondary');
                    }, 2000);
                }).catch(err => {
                    console.error('Could not copy text: ', err);
                });
            });
        }
    }

    function shortenText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substr(0, maxLength) + '...';
    }

    function displayFinalSummary(stats) {
        const missingPercent = stats.total > 0 ? Math.round((stats.missing / stats.total) * 100) : 0;

        summaryContent.innerHTML = `
            <div class="alert ${missingPercent > 30 ? 'alert-danger' : 'alert-info'}">
                <h4>Image Analysis Complete</h4>
                <p>Pages analyzed: <strong>${stats.pages}</strong></p>
                <p>Total images found: <strong>${stats.total}</strong></p>
                <p>Images missing alt text: <strong>${stats.missing}</strong> (${missingPercent}%)</p>
                <p>Images with alt text: <strong>${stats.total - stats.missing}</strong> (${100 - missingPercent}%)</p>
                <div class="progress">
                    <div class="progress-bar bg-success" role="progressbar" style="width: ${100 - missingPercent}%"
                         aria-valuenow="${100 - missingPercent}" aria-valuemin="0" aria-valuemax="100">
                        ${100 - missingPercent}%
                    </div>
                    <div class="progress-bar bg-danger" role="progressbar" style="width: ${missingPercent}%"
                         aria-valuenow="${missingPercent}" aria-valuemin="0" aria-valuemax="100">
                        ${missingPercent}%
                    </div>
                </div>
            </div>
            <div class="alert alert-info mt-3">
                <h5>About Lazy-loaded Images</h5>
                <p>This tool detects both standard images and lazy-loaded images that use data-src and similar attributes.</p>
                <p>Common lazy-loading patterns detected:</p>
                <ul>
                    <li><code>&lt;img data-src="image.jpg" class="lazyload"&gt;</code></li>
                    <li><code>&lt;img data-lazy-src="image.jpg"&gt;</code></li>
                    <li><code>&lt;img data-original="image.jpg"&gt;</code></li>
                </ul>
            </div>
            <p>Images without alt text are highlighted in red.</p>
            <button class="btn btn-success" id="export-btn">Export to CSV</button>
        `;

        // Add export functionality
        document.getElementById('export-btn').addEventListener('click', exportToCSV);
    }

    // Function to fetch with multiple CORS proxy fallbacks
    async function fetchWithProxy(url) {
        // Try different CORS proxies
        const corsProxies = [
            (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
            (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
            (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
            (url) => `https://cors-anywhere.herokuapp.com/${url}`,
            (url) => `https://crossorigin.me/${url}`
        ];

        let lastError = null;

        // Try each proxy
        for (const proxyFn of corsProxies) {
            try {
                const proxyUrl = proxyFn(url);
                console.log(`Trying proxy: ${proxyUrl}`);

                const response = await fetch(proxyUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 Website Image Alt Analyzer'
                    }
                });
                if (!response.ok) {
                    throw new Error(`Proxy returned status: ${response.status}`);
                }

                return await response.text();
            } catch (error) {
                console.warn(`Proxy failed:`, error);
                lastError = error;
                // Continue to the next proxy
            }
        }

        // If we get here, all proxies failed
        throw new Error(`All CORS proxies failed. Last error: ${lastError?.message || 'Unknown error'}`);
    }

    function exportToCSV() {
        const rows = Array.from(resultsBody.getElementsByTagName('tr'));
        let csvContent = "data:text/csv;charset=utf-8,";

        // Add headers
        csvContent += "Index,Page URL,Image URL,Alt Text\n";

        rows.forEach(row => {
            const cells = row.getElementsByTagName('td');
            const index = cells[0].textContent;
            const pageUrl = cells[1].querySelector('a').href;
            const imgSrc = cells[2].querySelector('img').src;
            let altText = cells[3].textContent.trim();

            // Handle the case where alt text is "Missing Alt Text"
            if (altText === "Missing Alt Text") {
                altText = "";
            }

            // Escape any quotes in the alt text
            altText = altText.replace(/"/g, '""');

            // Add row to CSV
            csvContent += `${index},"${pageUrl}","${imgSrc}","${altText}"\n`;
        });

        // Create download link
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', 'image-alt-analysis.csv');
        document.body.appendChild(link);

        // Trigger download
        link.click();

        // Clean up
        document.body.removeChild(link);
    }

    function updateProgress(percent) {
        progressBar.style.width = `${percent}%`;
    }

    function resetResults() {
        resultsBody.innerHTML = '';
        summary.style.display = 'none';
        resultsTable.style.display = 'none';
        progressBar.style.width = '0%';
    }

    // Add this to your script right after you set up the table headers
    function setupUrlToggle() {
        // Create toggle button and add it to the header
        const urlHeader = resultsTable.querySelector('thead th:nth-child(2)');
        if (urlHeader) {
            urlHeader.innerHTML = `
                Page URL
                <button id="toggle-urls" class="btn btn-sm btn-outline-secondary ms-2" title="Toggle URL display">
                    <i class="fas fa-expand-alt"></i>
                </button>
            `;

            // Add event listener for toggle
            document.getElementById('toggle-urls').addEventListener('click', function() {
                const urlCells = document.querySelectorAll('.page-url');
                const isExpanded = this.getAttribute('data-expanded') === 'true';

                if (isExpanded) {
                    // Collapse URLs
                    urlCells.forEach(cell => {
                        cell.style.maxWidth = '300px';
                    });
                    this.innerHTML = '<i class="fas fa-expand-alt"></i>';
                    this.setAttribute('data-expanded', 'false');
                } else {
                    // Expand URLs
                    urlCells.forEach(cell => {
                        cell.style.maxWidth = 'none';
                    });
                    this.innerHTML = '<i class="fas fa-compress-alt"></i>';
                    this.setAttribute('data-expanded', 'true');
                }
            });
        }
    }
});