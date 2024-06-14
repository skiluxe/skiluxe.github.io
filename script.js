// Calendar configuration (using flatpickr)
const checkInInput = document.getElementById("checkIn");
const checkOutInput = document.getElementById("checkOut");
const guestsInput = document.getElementById("guests");

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const dayAfterTomorrow = new Date();
dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

flatpickr(checkInInput, {
    minDate: "today",
    dateFormat: "Y-m-d",
    defaultDate: tomorrow,
    onChange: function (selectedDates, dateStr, instance) {
        checkOutInput.flatpickr({
            minDate: dateStr,
            defaultDate: new Date(dateStr).fp_incr(1),
            disable: getBlockedDatesForRoom(instance.input.closest('.room').dataset.room, selectedDates[0])
        });
    },
});

flatpickr(checkOutInput, {
    minDate: "today",
    dateFormat: "Y-m-d",
    defaultDate: dayAfterTomorrow,
});



// Room Descriptions and Blocked Dates (Example)
const roomDescriptions = {
    room1: {
        title: "Deluxe Room",
        overview: "Spacious and elegant with a king-size bed.",
        images: ["assets/room1.jpg", "assets/room1_2.jpg", "assets/room1_3.jpg"],
        blockedDates: [
            { from: "2024-06-13", to: "2024-06-18" },
        ],
        pricePerNight: 90,
    },
    room2: {
        title: "Suite",
        overview: "Luxurious suite with separate living area.",
        images: ["assets/room2.jpeg", "assets/room2_2.jpeg", "assets/room2_3.jpeg"],
        blockedDates: [
            { from: "2024-06-20", to: "2024-06-22" },
        ],
        pricePerNight: 100,
    },
    room3: {
        title: "Family Room",
        overview: "Comfortable room for families with two double beds.",
        images: ["assets/room3.jpg", "assets/room3_2.jpg", "assets/room3_3.jpg"],
        blockedDates: [],
        pricePerNight: 80,
    },
};

// Image Lightbox Functionality
const lightbox = document.getElementById("lightbox");
const imageGallery = lightbox.querySelector(".image-gallery");
const roomDetails = lightbox.querySelector(".room-details");

document.querySelectorAll(".room img").forEach(img => {
    img.addEventListener("click", () => {
        const roomName = img.parentElement.dataset.room;
        openRoomWindow(roomName);
    });
});


function openRoomWindow(roomName) {
    const room = roomDescriptions[roomName];
    if (!room) {
        console.error(`Room ${roomName} not found.`);
        return;
    }

    const width = 800;
    const height = 600;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;

    const roomWindow = window.open("", "_blank", `width=${width},height=${height},left=${left},top=${top}`);

    if (!roomWindow) {
        console.error("Failed to open room window.");
        return;
    }

    // Display the room availability in the new window based on the selected dates (if any)
    const checkInDate = document.getElementById("checkIn").value;
    const checkOutDate = document.getElementById("checkOut").value;
    const guests = parseInt(document.getElementById("guests").value, 10);

    // Calculate total price or availability message
    const availabilityMessage = calculateTotalPrice(roomName, checkInDate, checkOutDate, guests);

    roomWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${room.title}</title>
            <style>
                /* Your existing styles */
    
                .carousel {
                    width: 100%;
                    overflow: hidden;
                    position: relative; /* Ensure arrows are positioned relative to the carousel */
                }
    
                .carousel img {
                    max-width: 70%; /* Adjusted for better responsiveness */
                    height: auto;
                    display: none; /* Hide all images initially */
                    margin: 10px auto;
                }
    
                .carousel img.active {
                    display: block; /* Display only the active image */
                }
    
                .arrow {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    font-size: 24px;
                    cursor: pointer;
                    background-color: rgba(255, 255, 255, 0.5);
                    padding: 10px;
                    z-index: 100;
                }
    
                .arrow.left {
                    left: 0;
                }
    
                .arrow.right {
                    right: 0;
                }
            </style>
        </head>
        <body>
            <h1>${room.title}</h1>
            <p id="room-availability">
                ${availabilityMessage} 
            </p>
            <p>${room.overview}</p>
            <div class="carousel">
                ${room.images.map((image, index) => `
                    <img src="${image}" class="${index === 0 ? 'active' : ''}" alt="${room.title}">
                    <div class="arrow left" onclick="showImage(currentIndex - 1)">&lt;</div>
                    <div class="arrow right" onclick="showImage(currentIndex + 1)">&gt;</div>
                `).join('')}
            </div>
            <script>
                const images = document.querySelectorAll('.carousel img');
                let currentIndex = 0;
    
                function showImage(index) {
                    images[currentIndex].classList.remove('active');
                    currentIndex = (index + images.length) % images.length;
                    images[currentIndex].classList.add('active');
                }
            </script>
        </body>
        </html>
    `);

    roomWindow.document.close();
}

// Function to calculate the total price for a room
function calculateTotalPrice(roomName, checkInDate, checkOutDate, numGuests) {
    const room = roomDescriptions[roomName];

    if (!checkInDate || !checkOutDate || !isRoomAvailable(room, checkInDate, checkOutDate)) {
        return "Room is unavailable"; // Not available or invalid dates
    }

    const numberOfNights = getNumberOfNights(checkInDate, checkOutDate);
    let totalPrice = numberOfNights * room.pricePerNight;

    // Apply discount for 5 or more nights
    if (numberOfNights >= 5) {
        totalPrice *= 0.9; // 10% discount
    }

    // Apply guest count adjustments
    if (numGuests === 3) {
        totalPrice *= 1.1; // 10% increase for 3 guests
    } else if (numGuests === 1) {
        totalPrice *= 0.95; // 5% discount for 1 guest
    }

    return `Price per stay: $${totalPrice.toFixed(2)}`;
}

// Function to calculate number of nights between check-in and check-out dates
function getNumberOfNights(checkInDate, checkOutDate) {
    const oneDay = 24 * 60 * 60 * 1000;
    const firstDate = new Date(checkInDate);
    const secondDate = new Date(checkOutDate);

    const diffDays = Math.round(Math.abs((firstDate - secondDate) / oneDay));
    return diffDays;
}


// Function to check if a room is available on the given dates
// Function to check if a room is available on the given dates
function isRoomAvailable(room, checkInDate, checkOutDate) {
    if (!checkInDate || !checkOutDate) return true; // No dates selected, so room is available

    const blockedDates = room.blockedDates || [];
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    for (const blocked of blockedDates) {
        const start = new Date(blocked.from);
        const end = new Date(blocked.to);

        if (
            (checkIn >= start && checkIn <= end) ||
            (checkOut >= start && checkOut <= end) ||
            (checkIn <= start && checkOut >= end)
        ) {
            return false; // Unavailable
        }
    }
    return true; // Available
}

// Function to get room availability
function getRoomAvailability(roomName, checkInDate, checkOutDate) {
    const room = roomDescriptions[roomName];
    const isAvailable = isRoomAvailable(room, checkInDate, checkOutDate);
    return isAvailable ? "Room is available" : "Room is unavailable";
}
// Booking form submission handler
const bookingForm = document.getElementById("bookingForm");
bookingForm.addEventListener("submit", (event) => {
    event.preventDefault(); // Prevent default form submission

    const checkInDate = checkInInput.value;
    const checkOutDate = checkOutInput.value;
    const numGuests = parseInt(guestsInput.value, 10);

    // Calculate room availabilities dynamically
    const roomAvailabilities = {
        room1: calculateTotalPrice("room1", checkInDate, checkOutDate, numGuests),
        room2: calculateTotalPrice("room2", checkInDate, checkOutDate, numGuests),
        room3: calculateTotalPrice("room3", checkInDate, checkOutDate, numGuests),
    };

    displayRoomAvailabilities(roomAvailabilities);
});


// Set default number of guests to 2
guestsInput.value = "2"; // Set the default value of the select element

// Function to display room availabilities
// Function to display room availabilities
function displayRoomAvailabilities(availabilities) {
    for (const roomName in availabilities) {
        const roomElement = document.querySelector(`.room[data-room="${roomName}"]`);

        // Check if roomElement is found
        if (!roomElement) {
            console.error(`Room element not found for ${roomName}`);
            continue;
        }

        const availabilityElement = roomElement.querySelector(".availability");
        const bookButton = roomElement.querySelector(".book-now");

        // Check if availabilityElement and bookButton are found
        if (!availabilityElement || !bookButton) {
            console.error(`Availability or book button elements not found for ${roomName}`);
            continue;
        }

        if (availabilities[roomName].includes("Price per stay:")) { // If the room is available
            bookButton.style.display = "block";
            availabilityElement.textContent = availabilities[roomName];

            // Add event listener to the book button
            bookButton.addEventListener("click", () => {
                openBookingWindow(roomName);
            });

        } else {
            bookButton.style.display = "none";
            availabilityElement.textContent = availabilities[roomName];
        }
    }
}


// Function to open a new window for booking details (similar to openRoomWindow)
function openBookingWindow(roomName) {
    const room = roomDescriptions[roomName];
    const width = 600;  // Adjust width as needed
    const height = 400; // Adjust height as needed
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;

    const bookingWindow = window.open("", "_blank", `width=${width},height=${height},left=${left},top=${top}`);

    // Calculate total price or availability message
    const checkInDate = document.getElementById("checkIn").value;
    const checkOutDate = document.getElementById("checkOut").value;
    const guests = parseInt(document.getElementById("guests").value, 10);
    const totalPrice = calculateTotalPrice(roomName, checkInDate, checkOutDate, guests);

    bookingWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Booking for ${room.title}</title>
            <style>
                body { font-family: sans-serif; padding: 20px; }
                form { display: flex; flex-direction: column; }
                label { margin-bottom: 5px; }
                input, button { margin-bottom: 10px; padding: 8px; }
            </style>
        </head>
        <body>
            <div id="room-details">
                <h2>Booking for ${room.title}</h2>
                <p>${totalPrice}</p>
            </div>
            <form id="bookingFormInPopup">
                <input type="hidden" name="roomName" value="${roomName}">
                <label for="name">Name:</label>
                <input type="text" id="name" name="name" required>
                <label for="email">Email:</label>
                <input type="email" id="email" name="email" required>
<!--                <label for="phone">Phone:</label>-->
<!--                <input type="phone" id="phone" name="phone" required>-->
                <button type="submit">Confirm Booking</button>
            </form>
            <p id="confirmationMessage" style="display: none; font-size: 18px; text-align: center;">Thank you for your booking! We will contact you shortly.</p>
<!--            <img id="confirmationImage" src="assets/confirmation.jpg" alt="Confirmation Image" style="display: none; max-width: 100%; margin: 10px auto;"> -->
            <p id="emoji" style="display: none; text-align: center; font-size: 24px;">&#x1F609;</p>
            <script>
                const bookingForm = document.getElementById('bookingFormInPopup');
                const confirmationMessage = document.getElementById('confirmationMessage');
                const roomDetails = document.getElementById('room-details'); 
                const emoji = document.getElementById('emoji');
                // const confirmationImage = document.getElementById('confirmationImage');
                
                bookingForm.addEventListener('submit', (event) => {
                    event.preventDefault();
                    // Hide the form and room details, then show the confirmation message
                    bookingForm.style.display = 'none';
                    roomDetails.style.display = 'none'; 
                    confirmationMessage.style.display = 'block';
                    // confirmationImage.style.display = 'block';
                    emoji.style.display = 'block'; 
                    window.resizeTo(600, 200); 
                });
            </script>
        </body>
        </html>
    `);

    bookingWindow.document.close();
}


// Function to close booking popup
function closeBookingPopup() {
    const bookingPopup = document.getElementById("bookingFormPopup");
    bookingPopup.classList.add("hidden");
}
