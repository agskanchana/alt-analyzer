// Initialize tooltips
document.addEventListener('DOMContentLoaded', function() {
    // Enable tooltips everywhere
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    });

    // Your existing elements
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

    // PHP API endpoint
    const API_ENDPOINT = 'api.php';

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

    // Function to fetch a sitemap and get URLs
    async function fetchSitemapUrls(sitemapUrl) {
        try {
            const response = await fetch(`${API_ENDPOINT}?action=sitemap&url=${encodeURIComponent(sitemapUrl)}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error + (data.message ? `: ${data.message}` : ''));
            }

            return data.urls || [];
        } catch (error) {
            console.error(`Error fetching sitemap ${sitemapUrl}:`, error);
            throw error;
        }
    }

    // Sitemap analysis function
    async function startSitemapAnalysis(sitemapUrl) {
        try {
            // Show loading
            loading.style.display = 'block';
            loadingText.textContent = "Analyzing sitemap...";

            // Update the summary
            summary.style.display = 'block';
            summaryContent.innerHTML = `<p>Analyzing sitemap: ${sitemapUrl}</p>`;

            updateProgress(10);

            // Fetch and parse the sitemap
            const sitemapData = await fetch(`${API_ENDPOINT}?action=sitemap&url=${encodeURIComponent(sitemapUrl)}`)
                .then(response => response.json());

            if (sitemapData.error) {
                throw new Error(sitemapData.error + (sitemapData.message ? `: ${sitemapData.message}` : ''));
            }

            updateProgress(20);

            let pageUrls = [];

            if (sitemapData.type === 'sitemapindex') {
                // This is a sitemap index
                summaryContent.innerHTML = `<p>Found ${sitemapData.urls.length} sitemaps in the index.</p>`;

                // Process each sitemap in the index
                for (let i = 0; i < sitemapData.urls.length; i++) {
                    const subSitemapUrl = sitemapData.urls[i];
                    updateProgress(20 + (i / sitemapData.urls.length) * 30);
                    loadingText.textContent = `Processing sitemap ${i + 1} of ${sitemapData.urls.length}...`;

                    try {
                        const subSitemapUrls = await fetchSitemapUrls(subSitemapUrl);
                        pageUrls = pageUrls.concat(subSitemapUrls);
                    } catch (error) {
                        console.error(`Error processing sub-sitemap ${subSitemapUrl}:`, error);
                    }
                }
            } else if (sitemapData.type === 'urlset') {
                // This is a regular sitemap
                pageUrls = sitemapData.urls;
            } else {
                throw new Error('Unknown sitemap format');
            }

            // Remove duplicates
            pageUrls = [...new Set(pageUrls)];

            updateProgress(50);
            summaryContent.innerHTML = `<p>Found ${pageUrls.length} unique URLs in the sitemap(s).</p>
                                      <p>Now checking each page for images...</p>`;

            // Set up the table headers
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
                missing: 0,
                pages: 0
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

    // Website crawling function
    async function startWebsiteCrawl(startUrl) {
        try {
            // Reset crawler state
            visitedUrls = new Set();
            urlQueue = [];

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

                try {
                    // Process this page using our PHP backend
                    const response = await fetch(`${API_ENDPOINT}?action=analyze-page&url=${encodeURIComponent(url)}`);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const pageData = await response.json();

                    if (pageData.error) {
                        throw new Error(pageData.error + (pageData.message ? `: ${pageData.message}` : ''));
                    }

                    // Process images from this page
                    for (const image of pageData.images) {
                        // Check if we should include external images
                        if (!includeExternalImages) {
                            try {
                                const imgDomain = new URL(image.src).hostname;
                                if (imgDomain !== baseDomain) {
                                    console.log(`Skipping external image: ${image.src}`);
                                    continue;
                                }
                            } catch (e) {
                                console.warn(`Invalid image URL: ${image.src}`);
                                continue;
                            }
                        }

                        // Update stats
                        imageStats.total++;
                        if (image.hasMissingAlt) {
                            imageStats.missing++;
                        }

                        // Add to results table
                        addImageResult(url, image.src, image.alt, imageStats.total);
                    }

                    // Only continue crawling if we're not at max depth
                    if (depth < maxDepth) {
                        // Add new URLs to the queue
                        for (const newUrl of pageData.links) {
                            // Skip if we've already visited or queued this URL
                            if (visitedUrls.has(newUrl) || urlQueue.some(item => item.url === newUrl)) {
                                continue;
                            }

                            // Check if we should stay on the same domain
                            if (shouldStayOnDomain) {
                                try {
                                    const linkDomain = new URL(newUrl).hostname;
                                    if (linkDomain !== baseDomain) {
                                        continue;
                                    }
                                } catch (e) {
                                    continue;
                                }
                            }

                            // Skip non-HTML resources
                            const fileExtension = newUrl.split('?')[0].split('#')[0].split('.').pop().toLowerCase();
                            const nonHtmlExtensions = [
                                'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico',
                                'css', 'js', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar', 'exe',
                                'mp3', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'
                            ];

                            if (nonHtmlExtensions.includes(fileExtension)) {
                                continue;
                            }

                            urlQueue.push({ url: newUrl, depth: depth + 1 });
                        }
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

    // Function to process a batch of URLs and check for images
    async function processUrlsForImages(urls, stats) {
        // Process URLs in smaller batches to avoid overloading
        const batchSize = 5;

        for (let i = 0; i < urls.length; i += batchSize) {
            const batch = urls.slice(i, i + batchSize);

            // Update progress
            updateProgress(50 + (i / urls.length) * 50);
            loadingText.textContent = `Analyzing page ${i + 1} to ${Math.min(i + batchSize, urls.length)} of ${urls.length}...`;

            // Process the batch in parallel
            await Promise.all(batch.map(async url => {
                try {
                    // Use the PHP backend to analyze the page
                    const response = await fetch(`${API_ENDPOINT}?action=analyze-page&url=${encodeURIComponent(url)}`);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const pageData = await response.json();

                    if (pageData.error) {
                        throw new Error(pageData.error + (pageData.message ? `: ${pageData.message}` : ''));
                    }

                    // Process images from this page
                    for (const image of pageData.images) {
                        // Update stats
                        stats.total++;
                        if (image.hasMissingAlt) {
                            stats.missing++;
                        }

                        // Add to results table
                        addImageResult(url, image.src, image.alt, stats.total);
                    }

                    stats.pages++;
                } catch (error) {
                    console.error(`Error processing ${url}:`, error);
                }
            }));
        }
    }

    // Function to add an image result to the table
    function addImageResult(pageUrl, imgSrc, altText, index) {
        const row = document.createElement('tr');

        // Determine if alt is missing
        const isMissing = !altText;

        // Set row class if alt is missing
        if (isMissing) {
            row.className = 'table-danger';
        }

        row.innerHTML = `
            <td>${index}</td>
            <td>
                <div class="page-url">
                    <a href="${pageUrl}" target="_blank" data-bs-toggle="tooltip" title="${pageUrl}">
                        ${pageUrl}
                    </a>
                    <button class="btn btn-sm btn-outline-secondary ms-1 copy-url"
                           data-bs-toggle="tooltip" title="Copy URL" data-url="${pageUrl}">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </td>
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

        // Initialize tooltips for this row
        var tooltipTriggerList = [].slice.call(row.querySelectorAll('[data-bs-toggle="tooltip"]'))
        var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl)
        });
    }

    function setupUrlToggle() {
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
                this.setAttribute('title', 'Show full URLs');
            } else {
                // Expand URLs
                urlCells.forEach(cell => {
                    cell.style.maxWidth = 'none';
                });
                this.innerHTML = '<i class="fas fa-compress-alt"></i>';
                this.setAttribute('data-expanded', 'true');
                this.setAttribute('title', 'Truncate URLs');
            }

            // Update tooltip
            bootstrap.Tooltip.getInstance(this).dispose();
            new bootstrap.Tooltip(this);
        });
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

    function updateProgress(percent) {
        progressBar.style.width = `${percent}%`;
        progressBar.setAttribute('aria-valuenow', percent);
    }

    function resetResults() {
        resultsBody.innerHTML = '';
        resultsTable.style.display = 'none';
        summary.style.display = 'none';
        loading.style.display = 'none';
        progressBar.style.width = '0%';
    }

    function exportToCSV() {
        const rows = [];

        // Add headers
        rows.push(['#', 'Page URL', 'Image URL', 'Alt Text', 'Status']);

        // Add data
        document.querySelectorAll('#results-body tr').forEach((row, index) => {
            const cols = row.querySelectorAll('td');
            const pageUrl = cols[1].querySelector('a').getAttribute('href');
            const imgSrc = cols[2].querySelector('img').getAttribute('src');
            const altText = cols[3].textContent.trim();
            const status = altText === 'Missing Alt Text' ? 'Missing' : 'OK';

            rows.push([index + 1, pageUrl, imgSrc, altText, status]);
        });

        // Convert to CSV
        let csvContent = "data:text/csv;charset=utf-8,"
            + rows.map(e => e.map(item => `"${(item || '').toString().replace(/"/g, '""')}"`).join(",")).join("\n");

        // Download
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "image-alt-analysis.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
});