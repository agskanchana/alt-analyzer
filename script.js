document.addEventListener('DOMContentLoaded', function() {
    // Enable tooltips everywhere
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    });

    // Your existing elements
    const websiteUrlInput = document.getElementById('website-url');
    const maxPagesInput = document.getElementById('max-pages');
    const maxDepthInput = document.getElementById('max-depth');
    const stayOnDomainCheckbox = document.getElementById('stay-on-domain');
    const includeExternalImagesCheckbox = document.getElementById('include-external-images');
    const crawlSiteBtn = document.getElementById('crawl-site-btn');
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loading-text');
    const progressBar = document.getElementById('progress-bar');
    const results = document.getElementById('results');
    const summary = document.getElementById('summary');
    const summaryContent = document.getElementById('summary-content');
    const resultsTable = document.getElementById('results-table');
    const resultsBody = document.getElementById('results-body');

    // Filter elements
    const filterOptions = document.getElementById('filter-options');
    const hideDuplicatesCheckbox = document.getElementById('hide-duplicates');
    const onlyMissingAltCheckbox = document.getElementById('only-missing-alt');
    const searchResultsInput = document.getElementById('search-results');
    const clearSearchBtn = document.getElementById('clear-search');

    // Track visited URLs for crawler
    let visitedUrls = new Set();
    let urlQueue = [];
    let maxDepth = 3;
    let maxPages = 50;
    let baseDomain = '';
    let includeExternalImages = false;
    let shouldStayOnDomain = true;

    // Track all images and duplicates
    let allImages = [];
    let duplicateTracker = new Set();

    // PHP API endpoint
    const API_ENDPOINT = 'api.php';

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

    // Filter change handlers
    hideDuplicatesCheckbox.addEventListener('change', applyFilters);
    onlyMissingAltCheckbox.addEventListener('change', applyFilters);

    // Search functionality
    let searchTimeout;
    searchResultsInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(applyFilters, 300);
    });

    clearSearchBtn.addEventListener('click', function() {
        searchResultsInput.value = '';
        applyFilters();
    });

    // Website crawling function
    async function startWebsiteCrawl(startUrl) {
        try {
            // Reset crawler state and image tracking
            visitedUrls = new Set();
            urlQueue = [];
            allImages = [];
            duplicateTracker = new Set();

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
                pages: 0,
                duplicates: 0
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

                        // Create an image record with a unique fingerprint
                        const fingerprint = `${image.src}|${image.alt || ''}`;
                        const isDuplicate = duplicateTracker.has(fingerprint);

                        if (isDuplicate) {
                            imageStats.duplicates++;
                        }

                        duplicateTracker.add(fingerprint);

                        // Update stats
                        imageStats.total++;
                        if (image.hasMissingAlt) {
                            imageStats.missing++;
                        }

                        // Store the image data with page URL and duplicate status
                        const imageData = {
                            index: imageStats.total,
                            pageUrl: url,
                            imgSrc: image.src,
                            altText: image.alt || '',
                            hasMissingAlt: image.hasMissingAlt,
                            isDuplicate: isDuplicate,
                            fingerprint: fingerprint
                        };

                        allImages.push(imageData);

                        // Add to results table
                        addImageResultToTable(imageData);
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

            // Show filter options
            filterOptions.style.display = 'block';

            // Hide loading
            loading.style.display = 'none';

        } catch (error) {
            console.error('Error during website crawl:', error);
            loading.style.display = 'none';
            alert(`Error during website crawl: ${error.message}`);
        }
    }

    // Function to add an image result to the table
    function addImageResultToTable(imageData) {
        const row = document.createElement('tr');

        // Store image data with the row for filtering
        row.dataset.imgSrc = imageData.imgSrc;
        row.dataset.altText = imageData.altText;
        row.dataset.hasMissingAlt = imageData.hasMissingAlt;
        row.dataset.isDuplicate = imageData.isDuplicate;
        row.dataset.fingerprint = imageData.fingerprint;

        // Set classes for styling
        if (imageData.hasMissingAlt) {
            row.className = 'table-danger';
        }

        if (imageData.isDuplicate) {
            row.classList.add('duplicate-image');
        }

        row.innerHTML = `
            <td>${imageData.index}</td>
            <td>
                <div class="page-url">
                    <a href="${imageData.pageUrl}" target="_blank" data-bs-toggle="tooltip" title="${imageData.pageUrl}">
                        ${imageData.pageUrl}
                    </a>
                    <button class="btn btn-sm btn-outline-secondary ms-1 copy-url"
                           data-bs-toggle="tooltip" title="Copy URL" data-url="${imageData.pageUrl}">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </td>
            <td>
                <img src="${imageData.imgSrc}" class="img-thumbnail"
                    onerror="this.onerror=null; this.src='https://via.placeholder.com/150x75?text=Image+Not+Available'">
                ${imageData.isDuplicate ? '<span class="badge bg-warning text-dark ms-2">Duplicate</span>' : ''}
            </td>
            <td>${imageData.hasMissingAlt ? '<span class="badge bg-danger">Missing Alt Text</span>' : imageData.altText}</td>
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

    // Function to apply filters
    function applyFilters() {
        const hideDuplicates = hideDuplicatesCheckbox.checked;
        const onlyMissingAlt = onlyMissingAltCheckbox.checked;
        const searchTerm = searchResultsInput.value.toLowerCase();

        // Count visible rows
        let visibleCount = 0;

        // Get all rows
        const rows = resultsBody.querySelectorAll('tr');

        rows.forEach(row => {
            let shouldShow = true;

            // Filter by duplicate status
            if (hideDuplicates && row.dataset.isDuplicate === 'true') {
                shouldShow = false;
            }

            // Filter by missing alt text
            if (onlyMissingAlt && row.dataset.hasMissingAlt === 'false') {
                shouldShow = false;
            }

            // Filter by search term
            if (searchTerm && shouldShow) {
                const imgSrc = row.dataset.imgSrc.toLowerCase();
                const altText = row.dataset.altText.toLowerCase();
                const pageUrl = row.querySelector('.page-url a').getAttribute('href').toLowerCase();

                if (!imgSrc.includes(searchTerm) &&
                    !altText.includes(searchTerm) &&
                    !pageUrl.includes(searchTerm)) {
                    shouldShow = false;
                }
            }

            // Apply visibility
            if (shouldShow) {
                row.style.display = '';
                visibleCount++;
                // Update the index column for visible rows
                row.querySelector('td:first-child').textContent = visibleCount;
            } else {
                row.style.display = 'none';
            }
        });

        // Update the summary with filter info
        const filterInfo = document.createElement('div');
        filterInfo.className = 'mt-2 alert alert-secondary';

        let filterText = `Showing ${visibleCount} of ${rows.length} images`;
        const activeFilters = [];

        if (hideDuplicates) activeFilters.push('hiding duplicates');
        if (onlyMissingAlt) activeFilters.push('only missing alt text');
        if (searchTerm) activeFilters.push(`matching "${searchTerm}"`);

        if (activeFilters.length > 0) {
            filterText += ` (${activeFilters.join(', ')})`;
        }

        filterInfo.textContent = filterText;

        // Update the filter info in the summary
        const existingFilterInfo = document.getElementById('filter-info');
        if (existingFilterInfo) {
            existingFilterInfo.replaceWith(filterInfo);
        } else {
            summaryContent.appendChild(filterInfo);
        }
        filterInfo.id = 'filter-info';
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
        const duplicatePercent = stats.total > 0 ? Math.round((stats.duplicates / stats.total) * 100) : 0;

        summaryContent.innerHTML = `
            <div class="alert ${missingPercent > 30 ? 'alert-danger' : 'alert-info'}">
                <h4>Image Analysis Complete</h4>
                <p>Pages analyzed: <strong>${stats.pages}</strong></p>
                <p>Total images found: <strong>${stats.total}</strong></p>
                <p>Images missing alt text: <strong>${stats.missing}</strong> (${missingPercent}%)</p>
                <p>Duplicate images: <strong>${stats.duplicates}</strong> (${duplicatePercent}%)</p>
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
            <p>Images without alt text are highlighted in red. Duplicate images are marked with a "Duplicate" badge.</p>
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
        filterOptions.style.display = 'none';
        loading.style.display = 'none';
        progressBar.style.width = '0%';

        // Reset filters
        hideDuplicatesCheckbox.checked = false;
        onlyMissingAltCheckbox.checked = false;
        searchResultsInput.value = '';
    }

    function exportToCSV() {
        const rows = [];

        // Add headers
        rows.push(['#', 'Page URL', 'Image URL', 'Alt Text', 'Status', 'Duplicate']);

        // Add data - only export visible rows
        document.querySelectorAll('#results-body tr').forEach((row, index) => {
            // Skip hidden rows
            if (row.style.display === 'none') {
                return;
            }

            const cols = row.querySelectorAll('td');
            const pageUrl = cols[1].querySelector('a').getAttribute('href');
            const imgSrc = cols[2].querySelector('img').getAttribute('src');
            const altText = row.dataset.altText;
            const status = row.dataset.hasMissingAlt === 'true' ? 'Missing' : 'OK';
            const duplicate = row.dataset.isDuplicate === 'true' ? 'Yes' : 'No';

            rows.push([index + 1, pageUrl, imgSrc, altText, status, duplicate]);
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